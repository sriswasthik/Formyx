import {
  REFERRAL_REWARD_DAYS,
  REFERRAL_REWARD_LIMIT,
  REFERRED_TRIAL_DAYS,
  referralLookupSchema,
  referralSummarySchema,
  TRIAL_DAYS,
} from '@formyx/shared';
import request from 'supertest';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRazorpayClient } from '../billing/razorpay.js';
import { createFakeMailer, startTestServer, type TestServer } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import {
  FAKE_RAZORPAY_KEY_ID,
  FAKE_PLAN_IDS,
  FAKE_RAZORPAY_KEY_SECRET,
  FAKE_RAZORPAY_WEBHOOK_SECRET,
  startFakeRazorpay,
  unix,
  webhookBody,
  webhookHeaders,
  type FakeRazorpay,
} from '../test/fake-razorpay.js';
import { requestAs } from '../test/team.js';
import { resumePausedSubscriptions } from './referrals.js';

/*
 * The referral program end to end: a friend signs up through a link and gets a longer trial;
 * their first payment earns the person who referred them a free month.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const logger = pino({ level: 'silent' });
let razorpay: FakeRazorpay;
let server: TestServer;
const mailer = createFakeMailer();

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

beforeEach(async () => {
  await resetDatabase();
  razorpay.reset();
  mailer.sent.length = 0;
});

async function signUp(email: string, extra: Record<string, string> = {}) {
  const res = await request(server.app)
    .post('/api/auth/register')
    .send({
      name: `${email.split('@')[0] ?? ''} Example`,
      email,
      password: 'correct horse battery',
      ...extra,
    })
    .expect(201);
  const me = res.body as { user: { id: string }; workspaces: { id: string }[] };
  return { userId: me.user.id, workspaceId: me.workspaces[0]?.id ?? '' };
}

async function codeOf(userId: string): Promise<string> {
  const res = await requestAs(server.app, userId).get('/api/referrals').expect(200);
  return referralSummarySchema.parse(res.body).code;
}

const trialDays = async (workspaceId: string) => {
  const { trialEndsAt, createdAt } = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  return Math.round(((trialEndsAt?.getTime() ?? 0) - createdAt.getTime()) / DAY_MS);
};

/** The friend's workspace is charged for the first time, as Razorpay tells it. */
async function friendPays(workspaceId: string, paymentId = 'pay_friend') {
  const id = `sub_${workspaceId}`;
  await prisma.subscription.upsert({
    where: { razorpaySubscriptionId: id },
    create: {
      workspaceId,
      razorpaySubscriptionId: id,
      plan: 'PRO',
      interval: 'MONTHLY',
      status: 'CREATED',
    },
    update: {},
  });
  const now = new Date();
  const body = JSON.stringify(
    webhookBody('subscription.charged', {
      subscription: {
        id,
        plan_id: 'plan_promonthly',
        status: 'active',
        current_start: unix(now),
        current_end: unix(new Date(now.getTime() + 30 * DAY_MS)),
      },
      payment: {
        id: paymentId,
        amount: 29_900,
        currency: 'INR',
        status: 'captured',
        created_at: unix(now),
      },
    }),
  );
  await request(server.app)
    .post('/api/webhooks/razorpay')
    .set(webhookHeaders(body))
    .send(body)
    .expect(200);
  await server.jobs.drain();
}

describe('signing up through a referral link', () => {
  it('gives the friend a longer trial and records who referred them', async () => {
    const referrer = await signUp('ada@example.com');
    const code = await codeOf(referrer.userId);
    const friend = await signUp('grace@example.com', { referralCode: code });

    expect(await trialDays(friend.workspaceId)).toBe(REFERRED_TRIAL_DAYS);
    expect(await trialDays(referrer.workspaceId)).toBe(TRIAL_DAYS);
    expect(await prisma.referral.findUnique({ where: { friendId: friend.userId } })).toMatchObject({
      referrerId: referrer.userId,
      rewardedAt: null,
    });
  });

  it('ignores a code nobody has, and notes the badge as a source', async () => {
    const friend = await signUp('grace@example.com', { referralCode: 'K7MQ2XPA', source: 'badge' });
    expect(await trialDays(friend.workspaceId)).toBe(TRIAL_DAYS);
    expect(await prisma.referral.count()).toBe(0);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: friend.userId } })).signupSource,
    ).toBe('badge');
  });
});

describe('/api/referrals', () => {
  it('gives each person one code, and lists who joined with it by first name', async () => {
    const referrer = await signUp('ada@example.com');
    const code = await codeOf(referrer.userId);
    expect(await codeOf(referrer.userId)).toBe(code);
    await signUp('grace@example.com', { referralCode: code });

    const res = await requestAs(server.app, referrer.userId).get('/api/referrals').expect(200);
    expect(referralSummarySchema.parse(res.body)).toMatchObject({
      code,
      friends: [{ name: 'grace', rewardedAt: null, reward: null }],
      rewardsEarned: 0,
      rewardLimit: REFERRAL_REWARD_LIMIT,
    });
  });

  it('looks a code up for the sign-up page, in any case, and nothing else', async () => {
    const referrer = await signUp('ada@example.com');
    const code = await codeOf(referrer.userId);
    const res = await request(server.app)
      .get(`/api/public/referrals/${code.toLowerCase()}`)
      .expect(200);
    expect(referralLookupSchema.parse(res.body)).toEqual({
      referrerName: 'ada',
      trialDays: REFERRED_TRIAL_DAYS,
    });
    await request(server.app).get('/api/public/referrals/K7MQ2XPA').expect(404);
    await request(server.app).get('/api/public/referrals/nonsense').expect(404);
  });

  it('is not for the demo account', async () => {
    const demo = await prisma.user.create({
      data: { name: 'Demo', email: 'demo@example.com', passwordHash: 'x', isDemo: true },
    });
    await requestAs(server.app, demo.id).get('/api/referrals').expect(403);
  });
});

describe('rewards', () => {
  it('gives a referrer on Free a month of Pro when their friend first pays, once', async () => {
    const referrer = await signUp('ada@example.com');
    const friend = await signUp('grace@example.com', {
      referralCode: await codeOf(referrer.userId),
    });

    await friendPays(friend.workspaceId);
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: referrer.workspaceId },
    });
    expect(workspace.complimentaryPlan).toBe('PRO');
    const days = ((workspace.complimentaryUntil?.getTime() ?? 0) - Date.now()) / DAY_MS;
    expect(Math.round(days)).toBe(REFERRAL_REWARD_DAYS);
    const rewardEmails = mailer.sent
      .flatMap(({ messages }) => messages)
      .filter(({ subject }) => subject === 'You earned a free month of Formyx');
    expect(rewardEmails.map(({ to }) => to)).toEqual(['ada@example.com']);

    await friendPays(friend.workspaceId, 'pay_friend_again');
    expect(
      (await prisma.workspace.findUniqueOrThrow({ where: { id: referrer.workspaceId } }))
        .complimentaryUntil,
    ).toEqual(workspace.complimentaryUntil);
    expect(await prisma.referral.findFirst()).toMatchObject({ reward: 'complimentary' });
  });

  it('pauses a paying referrer’s subscription for a month, then resumes it', async () => {
    const referrer = await signUp('ada@example.com');
    razorpay.subscriptions.set('sub_ada', {
      id: 'sub_ada',
      plan_id: 'plan_promonthly',
      status: 'active',
      total_count: 120,
    });
    await prisma.subscription.create({
      data: {
        workspaceId: referrer.workspaceId,
        razorpaySubscriptionId: 'sub_ada',
        plan: 'PRO',
        interval: 'MONTHLY',
        status: 'ACTIVE',
      },
    });
    const friend = await signUp('grace@example.com', {
      referralCode: await codeOf(referrer.userId),
    });

    await friendPays(friend.workspaceId);
    expect(razorpay.subscriptions.get('sub_ada')?.status).toBe('paused');
    const referral = await prisma.referral.findFirstOrThrow();
    expect(referral).toMatchObject({ reward: 'paused', pausedSubscriptionId: 'sub_ada' });

    const client = createRazorpayClient({
      RAZORPAY_KEY_ID: FAKE_RAZORPAY_KEY_ID,
      RAZORPAY_KEY_SECRET: FAKE_RAZORPAY_KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET: FAKE_RAZORPAY_WEBHOOK_SECRET,
      RAZORPAY_API_URL: razorpay.url,
      ...FAKE_PLAN_IDS,
    });
    const deps = { prisma, logger, razorpay: client };
    expect(await resumePausedSubscriptions({ ...deps, now: () => new Date() })).toBe(0);
    const later = new Date((referral.resumeAt?.getTime() ?? 0) + 60_000);
    expect(await resumePausedSubscriptions({ ...deps, now: () => later })).toBe(1);
    expect(razorpay.subscriptions.get('sub_ada')?.status).toBe('active');
    expect(await resumePausedSubscriptions({ ...deps, now: () => later })).toBe(0);
  });

  it('stops at the limit', async () => {
    const referrer = await signUp('ada@example.com');
    const code = await codeOf(referrer.userId);
    for (let index = 0; index < REFERRAL_REWARD_LIMIT; index++) {
      const extra = await prisma.user.create({
        data: { name: 'Past', email: `past${String(index)}@example.com`, passwordHash: 'x' },
      });
      await prisma.referral.create({
        data: { referrerId: referrer.userId, friendId: extra.id, rewardedAt: new Date() },
      });
    }
    const friend = await signUp('grace@example.com', { referralCode: code });
    await friendPays(friend.workspaceId);
    expect(
      (await prisma.workspace.findUniqueOrThrow({ where: { id: referrer.workspaceId } }))
        .complimentaryPlan,
    ).toBeNull();
  });
});
