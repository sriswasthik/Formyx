import { apiErrorSchema } from '@formyx/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RazorpayPayment, RazorpaySubscription } from '../billing/razorpay.js';
import { createFakeMailer, startTestServer, type TestServer } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import {
  FAKE_RAZORPAY_WEBHOOK_SECRET,
  startFakeRazorpay,
  unix,
  webhookBody,
  webhookHeaders,
  type FakeRazorpay,
} from '../test/fake-razorpay.js';
import { createTeam, type Team } from '../test/team.js';

/*
 * Razorpay's webhooks, end to end: the endpoint checks the signature over the raw body,
 * stores each event once, and the job queue applies it to the subscription, its payments and
 * the workspace's plan.
 */

let razorpay: FakeRazorpay;
let server: TestServer;
const mailer = createFakeMailer();
const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  razorpay = await startFakeRazorpay();
  server = await startTestServer({
    mailer,
    autoRunJobs: false,
    env: { ...razorpay.env, ENTITLEMENTS_MODE: 'enforced' },
  });
});

afterAll(async () => {
  await server.close();
  await razorpay.close();
});

let team: Team;
const SUBSCRIPTION = 'sub_webhooktest';
const periodStart = new Date('2026-10-01T00:00:00Z');
const periodEnd = new Date('2026-11-01T00:00:00Z');

beforeEach(async () => {
  await resetDatabase();
  razorpay.reset();
  mailer.sent.length = 0;
  team = await createTeam(prisma);
  await prisma.subscription.create({
    data: {
      workspaceId: team.workspaceId,
      razorpaySubscriptionId: SUBSCRIPTION,
      plan: 'PRO',
      interval: 'MONTHLY',
      status: 'CREATED',
    },
  });
});

function subscription(
  status: string,
  overrides: Partial<RazorpaySubscription> = {},
): RazorpaySubscription {
  return {
    id: SUBSCRIPTION,
    plan_id: 'plan_promonthly',
    customer_id: 'cust_webhooktest',
    status,
    current_start: unix(periodStart),
    current_end: unix(periodEnd),
    ...overrides,
  };
}

function payment(overrides: Partial<RazorpayPayment> = {}): RazorpayPayment {
  return {
    id: 'pay_webhooktest',
    amount: 29_900,
    currency: 'INR',
    status: 'captured',
    invoice_id: null,
    customer_id: 'cust_webhooktest',
    created_at: unix(periodStart),
    ...overrides,
  };
}

/** Sends a webhook as Razorpay would, and lets the queue apply it. */
async function deliver(
  event: string,
  entities: { subscription?: RazorpaySubscription; payment?: RazorpayPayment },
  { at = new Date(), eventId }: { at?: Date; eventId?: string } = {},
) {
  const body = JSON.stringify(webhookBody(event, entities, at));
  const res = await request(server.app)
    .post('/api/webhooks/razorpay')
    .set(webhookHeaders(body, eventId ? { eventId } : {}))
    .send(body);
  await server.jobs.drain();
  return res;
}

const workspace = () =>
  prisma.workspace.findUniqueOrThrow({
    where: { id: team.workspaceId },
    select: {
      plan: true,
      planStatus: true,
      trialEndsAt: true,
      graceEndsAt: true,
      downgradedFrom: true,
      downgradedAt: true,
    },
  });
const storedSubscription = () =>
  prisma.subscription.findUniqueOrThrow({ where: { razorpaySubscriptionId: SUBSCRIPTION } });
const emailsTo = (subject: RegExp) =>
  mailer.sent
    .flatMap(({ messages }) => messages)
    .filter((message) => subject.test(message.subject));

describe('the endpoint', () => {
  it('stores and applies a correctly signed event', async () => {
    const res = await deliver('subscription.activated', { subscription: subscription('active') });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    const [event] = await prisma.razorpayEvent.findMany();
    expect(event).toMatchObject({ type: 'subscription.activated', error: null });
    expect(event?.processedAt).toBeInstanceOf(Date);
  });

  it('refuses a wrong signature, a tampered body and a missing one', async () => {
    const body = JSON.stringify(
      webhookBody('subscription.activated', { subscription: subscription('active') }),
    );
    const signedOther = webhookHeaders(body, { secret: 'not-the-secret' });
    const tamperedBody = body.replace('"active"', '"halted"');
    const headers = webhookHeaders(body);
    const { 'X-Razorpay-Signature': _missing, ...unsigned } = headers;

    for (const [send, sentHeaders] of [
      [body, signedOther],
      [tamperedBody, headers],
      [body, unsigned],
    ] as const) {
      const res = await request(server.app)
        .post('/api/webhooks/razorpay')
        .set(sentHeaders)
        .send(send);
      expect(res.status).toBe(400);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('INVALID_SIGNATURE');
    }
    await server.jobs.drain();
    expect(await prisma.razorpayEvent.count()).toBe(0);
    expect((await workspace()).plan).toBe('FREE');
  });

  it('needs an event id', async () => {
    const body = JSON.stringify(
      webhookBody('subscription.activated', { subscription: subscription('active') }),
    );
    const { 'X-Razorpay-Event-Id': _id, ...headers } = webhookHeaders(body);
    const res = await request(server.app).post('/api/webhooks/razorpay').set(headers).send(body);
    expect(res.status).toBe(400);
  });

  it('applies an event delivered twice once', async () => {
    const charged = { subscription: subscription('active'), payment: payment() };
    await deliver('subscription.charged', charged, { eventId: 'evt_twice' });
    const again = await deliver('subscription.charged', charged, { eventId: 'evt_twice' });
    expect(again.status).toBe(200);
    expect(await prisma.razorpayEvent.count()).toBe(1);
    const queued = server.jobs.sent.filter(
      ({ name, data }) =>
        name === 'billing.event' && (data as { eventId: string }).eventId === 'evt_twice',
    );
    expect(queued).toHaveLength(1);
    expect(await prisma.payment.count()).toBe(1);
  });

  it('answers 503 when payments are not set up', async () => {
    const plain = await startTestServer({ autoRunJobs: false });
    try {
      const res = await request(plain.app).post('/api/webhooks/razorpay').send('{}');
      expect(res.status).toBe(503);
    } finally {
      await plain.close();
    }
  });
});

describe('subscription events', () => {
  it('authenticated: nothing changes until the first charge', async () => {
    await deliver('subscription.authenticated', { subscription: subscription('authenticated') });
    expect((await storedSubscription()).status).toBe('AUTHENTICATED');
    expect(await workspace()).toMatchObject({ plan: 'FREE', planStatus: 'ACTIVE' });
  });

  it('activated: the workspace gets the plan, and a trial or past downgrade is over', async () => {
    await prisma.workspace.update({
      where: { id: team.workspaceId },
      data: {
        plan: 'PRO',
        planStatus: 'TRIALING',
        trialEndsAt: new Date(Date.now() + DAY_MS),
        downgradedFrom: 'PRO',
        downgradedAt: new Date(),
      },
    });
    await deliver('subscription.activated', { subscription: subscription('active') });
    expect(await workspace()).toMatchObject({
      plan: 'PRO',
      planStatus: 'ACTIVE',
      trialEndsAt: null,
      downgradedFrom: null,
    });
    expect(await storedSubscription()).toMatchObject({
      status: 'ACTIVE',
      razorpayCustomerId: 'cust_webhooktest',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });
  });

  it('charged: keeps the payment with its invoice link, and the plan from the plan id', async () => {
    const invoice = razorpay.invoice(SUBSCRIPTION, 'pay_webhooktest');
    await deliver('subscription.charged', {
      subscription: subscription('active', { plan_id: 'plan_businessyearly' }),
      payment: payment({ invoice_id: invoice.id, amount: 999_000 }),
    });
    expect(await workspace()).toMatchObject({ plan: 'BUSINESS', planStatus: 'ACTIVE' });
    expect(await storedSubscription()).toMatchObject({ plan: 'BUSINESS', interval: 'YEARLY' });
    expect(await prisma.payment.findMany()).toEqual([
      expect.objectContaining({
        razorpayPaymentId: 'pay_webhooktest',
        amount: 999_000,
        currency: 'INR',
        status: 'PAID',
        invoiceId: invoice.id,
        invoiceUrl: invoice.short_url,
        paidAt: periodStart,
      }),
    ]);
  });

  it('pending: past due with seven days’ grace from the first failure, owners told once', async () => {
    await deliver('subscription.activated', { subscription: subscription('active') });
    const failedAt = new Date('2026-11-01T06:00:00Z');
    await deliver(
      'subscription.pending',
      { subscription: subscription('pending') },
      { at: failedAt },
    );
    // Razorpay retries: a second failure doesn't move the end or email again.
    await deliver(
      'subscription.pending',
      { subscription: subscription('pending') },
      { at: new Date('2026-11-02T06:00:00Z') },
    );
    expect(await workspace()).toMatchObject({
      plan: 'PRO',
      planStatus: 'PAST_DUE',
      graceEndsAt: new Date(failedAt.getTime() + 7 * DAY_MS),
    });
    const emails = emailsTo(/couldn't renew/);
    expect(emails.map(({ to }) => to)).toEqual(['owner@example.com']);
  });

  it('charged after a failure: the grace period is over and the plan carries on', async () => {
    await deliver(
      'subscription.activated',
      { subscription: subscription('active') },
      { at: new Date('2026-10-01T00:00:00Z') },
    );
    await deliver(
      'subscription.pending',
      { subscription: subscription('pending') },
      { at: new Date('2026-11-01T00:00:00Z') },
    );
    await deliver(
      'subscription.charged',
      { subscription: subscription('active'), payment: payment({ id: 'pay_retry' }) },
      { at: new Date('2026-11-02T00:00:00Z') },
    );
    expect(await workspace()).toMatchObject({
      plan: 'PRO',
      planStatus: 'ACTIVE',
      graceEndsAt: null,
    });
  });

  it('halted within the grace period: still past due; after it: Free', async () => {
    await deliver(
      'subscription.activated',
      { subscription: subscription('active') },
      { at: new Date('2026-10-01T00:00:00Z') },
    );
    const recent = new Date(Date.now() - DAY_MS);
    await deliver('subscription.halted', { subscription: subscription('halted') }, { at: recent });
    expect(await workspace()).toMatchObject({ plan: 'PRO', planStatus: 'PAST_DUE' });

    await prisma.workspace.update({
      where: { id: team.workspaceId },
      data: { graceEndsAt: new Date(Date.now() - 1000) },
    });
    await deliver(
      'subscription.halted',
      { subscription: subscription('halted') },
      { at: new Date() },
    );
    expect(await workspace()).toMatchObject({
      plan: 'FREE',
      planStatus: 'ACTIVE',
      downgradedFrom: 'PRO',
    });
    expect(emailsTo(/now on the Free plan/)).toHaveLength(1);
  });

  it.each(['cancelled', 'completed'])('%s: Free, remembering the plan it had', async (status) => {
    await deliver(
      'subscription.activated',
      { subscription: subscription('active') },
      { at: new Date('2026-10-01T00:00:00Z') },
    );
    await deliver(
      `subscription.${status}`,
      { subscription: subscription(status) },
      { at: new Date('2026-11-01T00:00:00Z') },
    );
    const after = await workspace();
    expect(after).toMatchObject({ plan: 'FREE', planStatus: 'ACTIVE', downgradedFrom: 'PRO' });
    expect(after.downgradedAt).toBeInstanceOf(Date);
    expect((await storedSubscription()).status).toBe(status.toUpperCase());
    expect(emailsTo(/now on the Free plan/)).toHaveLength(1);
  });

  it('cancelled before it was ever paid for: nothing changes (a checkout given up on)', async () => {
    await prisma.workspace.update({
      where: { id: team.workspaceId },
      data: { plan: 'PRO', planStatus: 'TRIALING', trialEndsAt: new Date(Date.now() + DAY_MS) },
    });
    await deliver('subscription.cancelled', {
      subscription: subscription('cancelled', { current_start: null, current_end: null }),
    });
    expect(await workspace()).toMatchObject({ plan: 'PRO', planStatus: 'TRIALING' });
  });

  it('ignores an older event that arrives late', async () => {
    await deliver(
      'subscription.cancelled',
      { subscription: subscription('cancelled') },
      { at: new Date('2026-11-01T00:00:00Z') },
    );
    await deliver(
      'subscription.activated',
      { subscription: subscription('active') },
      { at: new Date('2026-10-01T00:00:00Z') },
    );
    expect((await storedSubscription()).status).toBe('CANCELLED');
    expect((await workspace()).plan).toBe('FREE');
  });

  it('leaves the plan to the newer subscription that replaced this one', async () => {
    await deliver(
      'subscription.activated',
      { subscription: subscription('active') },
      { at: new Date('2026-10-01T00:00:00Z') },
    );
    // Resumed: a new subscription, waiting to start when this one ends.
    await prisma.subscription.create({
      data: {
        workspaceId: team.workspaceId,
        razorpaySubscriptionId: 'sub_resumed',
        plan: 'PRO',
        interval: 'MONTHLY',
        status: 'AUTHENTICATED',
        createdAt: new Date(Date.now() + 1000),
      },
    });
    await deliver(
      'subscription.cancelled',
      { subscription: subscription('cancelled') },
      { at: new Date('2026-11-01T00:00:00Z') },
    );
    expect(await workspace()).toMatchObject({ plan: 'PRO', planStatus: 'ACTIVE' });
  });

  it('ignores subscriptions Formyx did not make', async () => {
    const res = await deliver('subscription.activated', {
      subscription: subscription('active', { id: 'sub_elsewhere' }),
    });
    expect(res.status).toBe(200);
    expect((await prisma.razorpayEvent.findFirstOrThrow()).processedAt).toBeInstanceOf(Date);
    expect((await workspace()).plan).toBe('FREE');
  });
});

describe('payment.failed', () => {
  it('during a running plan: past due, found through the invoice', async () => {
    await deliver(
      'subscription.activated',
      { subscription: subscription('active') },
      { at: new Date('2026-10-01T00:00:00Z') },
    );
    const invoice = razorpay.invoice(SUBSCRIPTION, 'pay_failed');
    await deliver('payment.failed', {
      payment: payment({
        id: 'pay_failed',
        status: 'failed',
        invoice_id: invoice.id,
        error_description: 'Your card was declined',
      }),
    });
    expect((await workspace()).planStatus).toBe('PAST_DUE');
    expect(
      await prisma.payment.findUniqueOrThrow({ where: { razorpayPaymentId: 'pay_failed' } }),
    ).toMatchObject({
      status: 'FAILED',
      failureReason: 'Your card was declined',
      paidAt: null,
    });
  });

  it('at checkout: kept in the history, but nothing changes', async () => {
    await deliver('payment.failed', {
      payment: payment({ id: 'pay_checkout', status: 'failed', subscription_id: SUBSCRIPTION }),
    });
    expect(await workspace()).toMatchObject({ plan: 'FREE', planStatus: 'ACTIVE' });
    expect(await prisma.payment.count({ where: { status: 'FAILED' } })).toBe(1);
  });

  it('for no subscription of ours: nothing', async () => {
    await deliver('payment.failed', { payment: payment({ id: 'pay_other', status: 'failed' }) });
    expect(await prisma.payment.count()).toBe(0);
  });
});

describe('when applying fails', () => {
  it('records why, and the job tries again', async () => {
    const invoice = razorpay.invoice(SUBSCRIPTION, 'pay_retry');
    // The invoice lookup fails twice, then works.
    razorpay.fail(500, 500);
    await deliver('payment.failed', {
      payment: payment({ id: 'pay_retry', status: 'failed', invoice_id: invoice.id }),
    });
    const event = await prisma.razorpayEvent.findFirstOrThrow();
    expect(event.processedAt).toBeInstanceOf(Date);
    expect(event.error).toBeNull();
    expect(await prisma.payment.count()).toBe(1);
  });
});

it('uses the webhook secret, not the key secret', () => {
  expect(FAKE_RAZORPAY_WEBHOOK_SECRET).not.toBe(razorpay.env.RAZORPAY_KEY_SECRET);
});
