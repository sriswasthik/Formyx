import {
  apiErrorSchema,
  billingSummarySchema,
  checkoutSchema,
  createDefaultLiveSettings,
  createDefaultTheme,
  createEmptyForm,
  paymentsResponseSchema,
} from '@formyx/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRecordingAnalytics } from '../lib/product-analytics.js';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import {
  checkoutSignature,
  startFakeRazorpay,
  unix,
  type FakeRazorpay,
} from '../test/fake-razorpay.js';
import { createPublishedForm, createSubmission } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

let razorpay: FakeRazorpay;
let app: ReturnType<typeof createTestApp>;
const analytics = createRecordingAnalytics();
const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  razorpay = await startFakeRazorpay();
  app = createTestApp({ ...razorpay.env, ENTITLEMENTS_MODE: 'enforced' }, { analytics });
});
afterAll(async () => {
  await razorpay.close();
});

let team: Team;
let owner: ReturnType<typeof requestAs>;
const billing = () => `/api/workspaces/${team.workspaceId}/billing`;

beforeEach(async () => {
  await resetDatabase();
  razorpay.reset();
  analytics.events.length = 0;
  team = await createTeam(prisma);
  owner = requestAs(app, team.users.OWNER);
});

/** A subscription Razorpay has activated (as its webhook would have recorded it). */
async function activeSubscription(
  overrides: { plan?: 'PRO' | 'BUSINESS'; interval?: 'MONTHLY' | 'YEARLY' } = {},
) {
  const plan = overrides.plan ?? 'PRO';
  const interval = overrides.interval ?? 'MONTHLY';
  const res = await owner.post(`${billing()}/subscribe`, {
    plan,
    interval: interval.toLowerCase(),
  });
  const { subscriptionId } = checkoutSchema.parse(res.body);
  const fake = razorpay.subscriptions.get(subscriptionId);
  if (fake) fake.status = 'active';
  const periodEnd = new Date(Date.now() + 20 * DAY_MS);
  await prisma.subscription.update({
    where: { razorpaySubscriptionId: subscriptionId },
    data: {
      status: 'ACTIVE',
      currentPeriodStart: new Date(Date.now() - 10 * DAY_MS),
      currentPeriodEnd: periodEnd,
    },
  });
  await prisma.workspace.update({
    where: { id: team.workspaceId },
    data: { plan, planStatus: 'ACTIVE' },
  });
  return { subscriptionId, periodEnd };
}

describe('GET billing', () => {
  it('says where billing stands, with this period’s usage', async () => {
    await prisma.workspace.update({
      where: { id: team.workspaceId },
      data: {
        plan: 'PRO',
        planStatus: 'TRIALING',
        trialEndsAt: new Date(Date.now() + 10 * DAY_MS),
      },
    });
    const form = await createPublishedForm(prisma, team.workspaceId, createEmptyForm());
    await createSubmission(prisma, form.id);
    await createSubmission(prisma, form.id);
    // Last month's doesn't count.
    await createSubmission(prisma, form.id, { createdAt: new Date(Date.now() - 45 * DAY_MS) });

    const res = await owner.get(billing()).expect(200);
    const summary = billingSummarySchema.parse(res.body);
    expect(summary).toMatchObject({
      plan: 'PRO',
      effectivePlan: 'PRO',
      planStatus: 'TRIALING',
      subscription: null,
      downgrade: null,
      enforcement: 'soft',
      checkoutAvailable: true,
    });
    expect(summary.usage.responses).toEqual({ used: 2, limit: 10_000 });
  });

  it('adds up the files respondents uploaded', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, createEmptyForm());
    const file = (size: number) => ({
      url: 'https://res.cloudinary.com/x/raw/upload/a.pdf',
      publicId: `formyx/a-${String(size)}`,
      name: 'a.pdf',
      size,
      type: 'application/pdf',
    });
    await prisma.submission.create({
      data: {
        formId: form.id,
        answers: { cv: file(1000), photos: [file(200), file(300)], name: 'Ada' },
        metadata: {},
      },
    });
    const summary = billingSummarySchema.parse((await owner.get(billing()).expect(200)).body);
    expect(summary.usage.storageBytes).toEqual({ used: 1500, limit: null });
  });

  it('lists what a downgrade changed, until it is dismissed', async () => {
    const theme = createDefaultTheme();
    const form = await createPublishedForm(prisma, team.workspaceId, createEmptyForm(), 'Launch');
    await prisma.form.update({
      where: { id: form.id },
      data: {
        publishedTheme: { ...theme, typography: { ...theme.typography, headingFont: 'fraunces' } },
        liveSettings: {
          autoresponder: { ...createDefaultLiveSettings().autoresponder, enabled: true },
        },
      },
    });
    await prisma.workspace.update({
      where: { id: team.workspaceId },
      data: { downgradedFrom: 'PRO', downgradedAt: new Date() },
    });
    const summary = billingSummarySchema.parse((await owner.get(billing()).expect(200)).body);
    expect(summary.downgrade).toMatchObject({
      from: 'PRO',
      forms: [{ formId: form.id, title: 'Launch', features: ['premium_fonts', 'autoresponder'] }],
    });

    await owner.post(`${billing()}/dismiss-downgrade`).expect(204);
    expect(
      billingSummarySchema.parse((await owner.get(billing()).expect(200)).body).downgrade,
    ).toBeNull();
  });

  it('says checkout is off when Razorpay is not set up', async () => {
    const plain = createTestApp({ ENTITLEMENTS_MODE: 'enforced' });
    const as = requestAs(plain, team.users.OWNER);
    const summary = billingSummarySchema.parse((await as.get(billing()).expect(200)).body);
    expect(summary.checkoutAvailable).toBe(false);
    const res = await as.post(`${billing()}/subscribe`, { plan: 'PRO', interval: 'monthly' });
    expect(res.status).toBe(503);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('BILLING_UNAVAILABLE');
  });
});

describe('subscribe', () => {
  it('makes a customer and a subscription, and returns what Checkout needs', async () => {
    const res = await owner.post(`${billing()}/subscribe`, { plan: 'PRO', interval: 'yearly' });
    expect(res.status).toBe(201);
    const checkout = checkoutSchema.parse(res.body);
    expect(checkout).toMatchObject({
      keyId: 'rzp_test_fake',
      plan: 'PRO',
      interval: 'yearly',
      amount: 299_000,
      currency: 'INR',
      prefill: { name: 'OWNER', email: 'owner@example.com' },
    });
    expect(razorpay.subscriptions.get(checkout.subscriptionId)).toMatchObject({
      plan_id: 'plan_proyearly',
      total_count: 10,
      notes: { workspaceId: team.workspaceId },
    });
    expect(await prisma.subscription.findFirstOrThrow()).toMatchObject({
      workspaceId: team.workspaceId,
      status: 'CREATED',
      plan: 'PRO',
      interval: 'YEARLY',
      createdById: team.users.OWNER,
    });
    // Nothing is paid yet.
    expect(
      (await prisma.workspace.findUniqueOrThrow({ where: { id: team.workspaceId } })).plan,
    ).toBe('FREE');
    expect(analytics.events.map(({ event }) => event.name)).toEqual(['checkout_started']);
  });

  it('keeps one Razorpay customer per workspace', async () => {
    await owner.post(`${billing()}/subscribe`, { plan: 'PRO', interval: 'monthly' }).expect(201);
    await owner
      .post(`${billing()}/subscribe`, { plan: 'BUSINESS', interval: 'monthly' })
      .expect(201);
    expect(razorpay.requests.filter(({ path }) => path === '/v1/customers')).toHaveLength(1);
  });

  it('lets one owner pay for two workspaces as one Razorpay customer', async () => {
    const other = await prisma.workspace.create({ data: { name: 'Side', slug: 'side' } });
    await prisma.membership.create({
      data: { userId: team.users.OWNER, workspaceId: other.id, role: 'OWNER' },
    });
    await owner.post(`${billing()}/subscribe`, { plan: 'PRO', interval: 'monthly' }).expect(201);
    await owner
      .post(`/api/workspaces/${other.id}/billing/subscribe`, { plan: 'PRO', interval: 'monthly' })
      .expect(201);
    const customers = await prisma.workspace.findMany({ select: { razorpayCustomerId: true } });
    expect(new Set(customers.map(({ razorpayCustomerId }) => razorpayCustomerId)).size).toBe(1);
  });

  it('starts a plan bought during the trial when the trial ends', async () => {
    const trialEndsAt = new Date(Date.now() + 12 * DAY_MS);
    await prisma.workspace.update({
      where: { id: team.workspaceId },
      data: { plan: 'PRO', planStatus: 'TRIALING', trialEndsAt },
    });
    const { subscriptionId } = checkoutSchema.parse(
      (await owner.post(`${billing()}/subscribe`, { plan: 'PRO', interval: 'monthly' })).body,
    );
    expect(razorpay.subscriptions.get(subscriptionId)?.start_at).toBe(unix(trialEndsAt));
  });

  it('refuses a second plan while one runs', async () => {
    await activeSubscription();
    const res = await owner.post(`${billing()}/subscribe`, {
      plan: 'BUSINESS',
      interval: 'monthly',
    });
    expect(res.status).toBe(409);
  });

  it('says Razorpay failed, and keeps nothing', async () => {
    razorpay.fail(500);
    const res = await owner.post(`${billing()}/subscribe`, { plan: 'PRO', interval: 'monthly' });
    expect(res.status).toBe(502);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('PAYMENT_PROVIDER_ERROR');
    expect(await prisma.subscription.count()).toBe(0);
  });

  it('checks what it is asked for', async () => {
    const res = await owner.post(`${billing()}/subscribe`, { plan: 'FREE', interval: 'monthly' });
    expect(res.status).toBe(400);
  });
});

describe('verify', () => {
  it('checks Checkout’s signature on the server and activates the plan as a fallback', async () => {
    const { subscriptionId } = checkoutSchema.parse(
      (await owner.post(`${billing()}/subscribe`, { plan: 'PRO', interval: 'monthly' })).body,
    );
    const res = await owner.post(`${billing()}/verify`, {
      razorpayPaymentId: 'pay_checkout1',
      razorpaySubscriptionId: subscriptionId,
      razorpaySignature: checkoutSignature('pay_checkout1', subscriptionId),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'confirming' });
    expect((await prisma.subscription.findFirstOrThrow()).verifiedAt).toBeInstanceOf(Date);
    // The plan is activated immediately as a fallback; the webhook will confirm idempotently.
    expect(
      (await prisma.workspace.findUniqueOrThrow({ where: { id: team.workspaceId } })).plan,
    ).toBe('PRO');
  });

  it('refuses a signature that doesn’t match', async () => {
    const { subscriptionId } = checkoutSchema.parse(
      (await owner.post(`${billing()}/subscribe`, { plan: 'PRO', interval: 'monthly' })).body,
    );
    const res = await owner.post(`${billing()}/verify`, {
      razorpayPaymentId: 'pay_checkout1',
      razorpaySubscriptionId: subscriptionId,
      razorpaySignature: checkoutSignature('pay_someoneelse', subscriptionId),
    });
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('INVALID_SIGNATURE');
    expect((await prisma.subscription.findFirstOrThrow()).verifiedAt).toBeNull();
  });

  it('only for the workspace’s own subscriptions', async () => {
    const other = await prisma.workspace.create({ data: { name: 'Other', slug: 'other' } });
    await prisma.subscription.create({
      data: {
        workspaceId: other.id,
        razorpaySubscriptionId: 'sub_theirs',
        plan: 'PRO',
        interval: 'MONTHLY',
      },
    });
    const res = await owner.post(`${billing()}/verify`, {
      razorpayPaymentId: 'pay_x',
      razorpaySubscriptionId: 'sub_theirs',
      razorpaySignature: checkoutSignature('pay_x', 'sub_theirs'),
    });
    expect(res.status).toBe(404);
  });
});

describe('cancel and resume', () => {
  it('cancels a paid plan at the end of its period, with the reason', async () => {
    const { subscriptionId } = await activeSubscription();
    const res = await owner.post(`${billing()}/cancel`, {
      reason: 'too_expensive',
      details: 'Just for one event',
    });
    expect(res.status).toBe(200);
    expect(billingSummarySchema.parse(res.body).subscription).toMatchObject({
      status: 'active',
      cancelAtPeriodEnd: true,
    });
    expect(razorpay.subscriptions.get(subscriptionId)).toMatchObject({
      status: 'active',
      cancel_at_cycle_end: true,
    });
    expect((await prisma.subscription.findFirstOrThrow()).cancelReason).toBe(
      'too_expensive: Just for one event',
    );
    // The plan runs to the end of what was paid for.
    expect(
      (await prisma.workspace.findUniqueOrThrow({ where: { id: team.workspaceId } })).plan,
    ).toBe('PRO');
    expect(analytics.events.at(-1)?.event).toEqual({
      name: 'subscription_cancelled',
      properties: { targetPlan: 'PRO', reason: 'too_expensive' },
    });
  });

  it('cancels at once a plan that hasn’t started', async () => {
    const { subscriptionId } = checkoutSchema.parse(
      (await owner.post(`${billing()}/subscribe`, { plan: 'PRO', interval: 'monthly' })).body,
    );
    await prisma.subscription.update({
      where: { razorpaySubscriptionId: subscriptionId },
      data: { status: 'AUTHENTICATED' },
    });
    await owner.post(`${billing()}/cancel`, {}).expect(200);
    expect(razorpay.subscriptions.get(subscriptionId)?.status).toBe('cancelled');
  });

  it('needs a plan to cancel', async () => {
    expect((await owner.post(`${billing()}/cancel`, {})).status).toBe(404);
  });

  it('resumes a plan set to end with a new one from the day it ends', async () => {
    const { periodEnd } = await activeSubscription({ plan: 'BUSINESS', interval: 'YEARLY' });
    await owner.post(`${billing()}/cancel`, {}).expect(200);
    const res = await owner.post(`${billing()}/resume`);
    expect(res.status).toBe(201);
    const checkout = checkoutSchema.parse(res.body);
    expect(checkout).toMatchObject({ plan: 'BUSINESS', interval: 'yearly' });
    expect(razorpay.subscriptions.get(checkout.subscriptionId)).toMatchObject({
      plan_id: 'plan_businessyearly',
      start_at: unix(periodEnd),
    });
  });

  it('has nothing to resume when nothing is set to end', async () => {
    await activeSubscription();
    expect((await owner.post(`${billing()}/resume`)).status).toBe(409);
  });
});

describe('change plan', () => {
  it('moves up at once', async () => {
    const { subscriptionId } = await activeSubscription();
    const res = await owner.post(`${billing()}/change-plan`, {
      plan: 'BUSINESS',
      interval: 'monthly',
    });
    expect(res.status).toBe(200);
    expect(billingSummarySchema.parse(res.body)).toMatchObject({
      plan: 'BUSINESS',
      effectivePlan: 'BUSINESS',
    });
    expect(razorpay.subscriptions.get(subscriptionId)?.plan_id).toBe('plan_businessmonthly');
  });

  it('moves down when the period ends', async () => {
    const { subscriptionId } = await activeSubscription({ plan: 'BUSINESS' });
    const res = await owner.post(`${billing()}/change-plan`, { plan: 'PRO', interval: 'monthly' });
    expect(billingSummarySchema.parse(res.body).plan).toBe('BUSINESS');
    expect(razorpay.subscriptions.get(subscriptionId)).toMatchObject({
      plan_id: 'plan_businessmonthly',
      scheduled_plan_id: 'plan_promonthly',
    });
  });

  it('refuses the plan it already has', async () => {
    await activeSubscription();
    const res = await owner.post(`${billing()}/change-plan`, { plan: 'PRO', interval: 'monthly' });
    expect(res.status).toBe(400);
  });
});

describe('payments', () => {
  it('lists payments, newest first, with invoice links', async () => {
    await prisma.payment.createMany({
      data: [
        {
          workspaceId: team.workspaceId,
          razorpayPaymentId: 'pay_old',
          amount: 29_900,
          currency: 'INR',
          status: 'PAID',
          invoiceUrl: 'https://rzp.io/i/old',
          paidAt: new Date('2026-09-01T00:00:00Z'),
          createdAt: new Date('2026-09-01T00:00:00Z'),
        },
        {
          workspaceId: team.workspaceId,
          razorpayPaymentId: 'pay_new',
          amount: 29_900,
          currency: 'INR',
          status: 'FAILED',
          failureReason: 'Card declined',
          createdAt: new Date('2026-10-01T00:00:00Z'),
        },
      ],
    });
    const { payments } = paymentsResponseSchema.parse(
      (await owner.get(`${billing()}/payments`).expect(200)).body,
    );
    expect(payments.map(({ id, status, invoiceUrl }) => [id, status, invoiceUrl])).toEqual([
      ['pay_new', 'failed', null],
      ['pay_old', 'paid', 'https://rzp.io/i/old'],
    ]);
  });
});

describe('who may', () => {
  it('keeps billing to owners', async () => {
    for (const role of ['EDITOR', 'VIEWER'] as const) {
      const as = requestAs(app, team.users[role]);
      expect((await as.get(billing())).status).toBe(403);
      expect(
        (await as.post(`${billing()}/subscribe`, { plan: 'PRO', interval: 'monthly' })).status,
      ).toBe(403);
    }
  });

  it('keeps the demo account from paying', async () => {
    await prisma.user.update({ where: { id: team.users.OWNER }, data: { isDemo: true } });
    const res = await owner.post(`${billing()}/subscribe`, { plan: 'PRO', interval: 'monthly' });
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('DEMO_RESTRICTED');
  });
});
