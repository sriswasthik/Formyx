import { createDefaultAccountPreferences } from '@formyx/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { encryptionFromEnv } from '../lib/encryption.js';
import { createUnsubscribeToken } from '../lib/unsubscribe-token.js';
import { registerEmailJobs } from '../notifications/email-jobs.js';
import { createFakeMailer, createTestQueue, TEST_JWT_SECRET } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createTeam, type Team } from '../test/team.js';
import { dueReminder, runBillingUpkeep, trialDaysLeft } from './upkeep.js';

/*
 * The hourly billing job: reminders before a trial ends, and the move to Free when a trial,
 * a grace period or a complimentary plan runs out. Each email goes out once.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-20T10:05:00Z');
const encryption = encryptionFromEnv({ JWT_SECRET: TEST_JWT_SECRET });
const logger = pino({ level: 'silent' });

let team: Team;
let mailer: ReturnType<typeof createFakeMailer>;
let jobs: ReturnType<typeof createTestQueue>;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
  mailer = createFakeMailer();
  jobs = createTestQueue();
  registerEmailJobs(jobs, mailer, encryption);
});

async function run(now = NOW) {
  const counts = await runBillingUpkeep({
    prisma,
    jobs,
    encryption,
    env: { APP_URL: 'https://app.formyx.test', JWT_SECRET: TEST_JWT_SECRET },
    logger,
    now: () => now,
  });
  await jobs.drain();
  return counts;
}

const subjects = () =>
  mailer.sent.flatMap(({ messages }) => messages.map((message) => message.subject));
const workspace = () => prisma.workspace.findUniqueOrThrow({ where: { id: team.workspaceId } });
const trial = (endsIn: number) =>
  prisma.workspace.update({
    where: { id: team.workspaceId },
    data: { plan: 'PRO', planStatus: 'TRIALING', trialEndsAt: new Date(NOW.getTime() + endsIn) },
  });

describe('trial reminders', () => {
  it('picks the reminder due, never a late one', () => {
    expect([10, 7, 6, 4, 3, 2, 1, 0].map((days) => dueReminder(days))).toEqual([
      null,
      7,
      7,
      7,
      3,
      3,
      1,
      null,
    ]);
    expect(trialDaysLeft(new Date(NOW.getTime() + 2.5 * DAY_MS), NOW)).toBe(3);
  });

  it('reminds owners 7, 3 and 1 days before, each once', async () => {
    await trial(7 * DAY_MS);
    expect((await run()).reminders).toBe(1);
    expect((await run(new Date(NOW.getTime() + 60 * 60 * 1000))).reminders).toBe(0);
    await run(new Date(NOW.getTime() + 4 * DAY_MS));
    await run(new Date(NOW.getTime() + 6 * DAY_MS + 60_000));
    expect(subjects()).toEqual([
      'Your Pro trial ends in 7 days',
      'Your Pro trial ends in 3 days',
      'Your Pro trial ends in 1 day',
    ]);
    expect(mailer.sent[0]?.messages.map(({ to }) => to)).toEqual(['owner@example.com']);
  });

  it('are tips: each owner’s carries their own way to stop them, and those who did get none', async () => {
    const second = await prisma.user.create({
      data: {
        name: 'Grace',
        email: 'grace@example.com',
        passwordHash: 'x',
        preferences: { ...createDefaultAccountPreferences(), productEmails: false },
      },
    });
    await prisma.membership.create({
      data: { userId: second.id, workspaceId: team.workspaceId, role: 'OWNER' },
    });
    await trial(7 * DAY_MS);
    await run();

    const [reminder, ...others] = mailer.sent.flatMap(({ messages }) => messages);
    expect(others).toEqual([]);
    expect(reminder?.to).toBe('owner@example.com');
    const token = createUnsubscribeToken(team.users.OWNER, TEST_JWT_SECRET);
    expect(reminder?.text).toContain(`/unsubscribe/${token}`);
    expect(reminder?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('says nothing about a trial ending in more than a week', async () => {
    await trial(9 * DAY_MS);
    await run();
    expect(subjects()).toEqual([]);
  });
});

describe('ends', () => {
  it('moves a workspace whose trial ended to Free, and says what changed', async () => {
    await trial(-60_000);
    expect((await run()).trialsEnded).toBe(1);
    expect(await workspace()).toMatchObject({
      plan: 'FREE',
      planStatus: 'ACTIVE',
      trialEndsAt: null,
      downgradedFrom: 'PRO',
      downgradedAt: NOW,
    });
    expect(subjects()).toEqual(['Your Pro trial has ended']);
    await run();
    expect(subjects()).toHaveLength(1);
  });

  it('leaves a trial alone when a plan bought during it is waiting to start', async () => {
    await trial(-60_000);
    await prisma.subscription.create({
      data: {
        workspaceId: team.workspaceId,
        razorpaySubscriptionId: 'sub_waiting',
        plan: 'PRO',
        interval: 'MONTHLY',
        status: 'AUTHENTICATED',
      },
    });
    await run();
    expect((await workspace()).planStatus).toBe('TRIALING');
  });

  it('moves a workspace to Free once its grace period is over', async () => {
    await prisma.workspace.update({
      where: { id: team.workspaceId },
      data: {
        plan: 'BUSINESS',
        planStatus: 'PAST_DUE',
        graceEndsAt: new Date(NOW.getTime() + DAY_MS),
      },
    });
    expect((await run()).graceEnded).toBe(0);
    expect((await run(new Date(NOW.getTime() + DAY_MS))).graceEnded).toBe(1);
    expect(await workspace()).toMatchObject({
      plan: 'FREE',
      downgradedFrom: 'BUSINESS',
      graceEndsAt: null,
    });
    expect(subjects()).toEqual(['Your workspace is now on the Free plan']);
  });

  it('ends a complimentary plan, to Free unless the workspace pays for its own', async () => {
    await prisma.workspace.update({
      where: { id: team.workspaceId },
      data: { complimentaryPlan: 'BUSINESS', complimentaryUntil: new Date(NOW.getTime() - 1000) },
    });
    expect((await run()).complimentaryEnded).toBe(1);
    expect(await workspace()).toMatchObject({
      complimentaryPlan: null,
      complimentaryUntil: null,
      downgradedFrom: 'BUSINESS',
    });
    expect(subjects()).toEqual(['Your workspace is now on the Free plan']);
  });

  it('ends a complimentary plan quietly when the workspace pays', async () => {
    await prisma.workspace.update({
      where: { id: team.workspaceId },
      data: {
        plan: 'PRO',
        planStatus: 'ACTIVE',
        complimentaryPlan: 'BUSINESS',
        complimentaryUntil: new Date(NOW.getTime() - 1000),
      },
    });
    await run();
    expect(await workspace()).toMatchObject({ plan: 'PRO', downgradedFrom: null });
    expect(subjects()).toEqual([]);
  });
});

it('never emails the demo account', async () => {
  await prisma.user.update({ where: { id: team.users.OWNER }, data: { isDemo: true } });
  await trial(-60_000);
  await run();
  expect(mailer.sent.flatMap(({ messages }) => messages)).toEqual([]);
});
