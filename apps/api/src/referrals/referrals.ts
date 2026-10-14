import { randomBytes as nodeRandomBytes } from 'node:crypto';
import {
  higherPlan,
  makeReferralCode,
  REFERRAL_REWARD_DAYS,
  REFERRAL_REWARD_LIMIT,
  REFERRAL_REWARD_PLAN,
  REFERRED_TRIAL_DAYS,
  type ReferralLookup,
  type ReferralSummary,
} from '@formyx/shared';
import type { Logger } from 'pino';
import type { Database } from '../lib/prisma.js';
import { RazorpayError, type RazorpayClient } from '../billing/razorpay.js';

/*
 * The referral program. Everyone has a link (`/?ref=<code>`); a friend who signs up through it
 * gets a longer trial (auth-service.ts). When the friend first pays, the person who referred
 * them gets a month free (`rewardReferrer`, from billing/events.ts):
 * - if one of their workspaces pays for a plan, its Razorpay subscription pauses for a month,
 *   and the hourly job resumes it (`resumePausedSubscriptions`); the plan keeps working;
 * - otherwise their oldest workspace gets a month of Pro, complimentary.
 * Each friend counts once, and nobody gets more than REFERRAL_REWARD_LIMIT months.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CODE_ATTEMPTS = 5;

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export function createReferralService(
  prisma: Database,
  randomBytes: (count: number) => Uint8Array = nodeRandomBytes,
) {
  /** The person's code, made the first time it is asked for. */
  async function codeFor(userId: string): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (user.referralCode) return user.referralCode;
      try {
        const code = makeReferralCode(randomBytes);
        // Only if it still has none: two first visits at once agree on one code.
        await prisma.user.updateMany({
          where: { id: userId, referralCode: null },
          data: { referralCode: code },
        });
      } catch (error) {
        // Someone else has this code: draw again.
        if (!isUniqueViolation(error) || attempt >= CODE_ATTEMPTS) throw error;
      }
    }
  }

  return {
    codeFor,

    /** Who a code belongs to, for the sign-up page; `null` for unknown codes and the demo. */
    async lookup(code: string): Promise<ReferralLookup | null> {
      const user = await prisma.user.findUnique({
        where: { referralCode: code },
        select: { name: true, isDemo: true },
      });
      if (!user || user.isDemo) return null;
      return { referrerName: firstName(user.name), trialDays: REFERRED_TRIAL_DAYS };
    },

    async summary(userId: string): Promise<ReferralSummary> {
      const code = await codeFor(userId);
      const referrals = await prisma.referral.findMany({
        where: { referrerId: userId },
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          rewardedAt: true,
          reward: true,
          friend: { select: { name: true } },
        },
      });
      return {
        code,
        friends: referrals.map((referral) => ({
          name: firstName(referral.friend.name),
          joinedAt: referral.createdAt.toISOString(),
          rewardedAt: referral.rewardedAt?.toISOString() ?? null,
          reward:
            referral.reward === 'paused' || referral.reward === 'complimentary'
              ? referral.reward
              : null,
        })),
        rewardsEarned: referrals.filter((referral) => referral.rewardedAt).length,
        rewardLimit: REFERRAL_REWARD_LIMIT,
      };
    },
  };
}

/** The account a code belongs to, if it may refer people (not the demo account). */
export async function referrerByCode(prisma: Database, code: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true, isDemo: true },
  });
  return user && !user.isDemo ? user.id : null;
}

export interface RewardDependencies {
  prisma: Database;
  razorpay: RazorpayClient;
  logger: Logger;
  now?: () => Date;
}

export type RewardResult = {
  referralId: string;
  referrerId: string;
  friendName: string;
  reward: 'paused' | 'complimentary';
  workspaceId: string;
} | null;

/**
 * A workspace was paid for: if one of its owners was referred and their referrer has not had
 * a reward for them yet, gives it. Safe to call for every payment, and to repeat.
 */
export async function rewardReferrer(
  deps: RewardDependencies,
  payingWorkspaceId: string,
): Promise<RewardResult> {
  const { prisma, logger } = deps;
  const now = deps.now?.() ?? new Date();
  const referral = await prisma.referral.findFirst({
    where: {
      rewardedAt: null,
      friend: { memberships: { some: { workspaceId: payingWorkspaceId, role: 'OWNER' } } },
    },
    select: { id: true, referrerId: true, friend: { select: { name: true } } },
  });
  if (!referral) return null;
  const given = {
    referralId: referral.id,
    referrerId: referral.referrerId,
    friendName: referral.friend.name,
  };

  const earned = await prisma.referral.count({
    where: { referrerId: referral.referrerId, rewardedAt: { not: null } },
  });
  if (earned >= REFERRAL_REWARD_LIMIT) {
    // Counted as rewarded, so the friend is not looked at again; nothing given.
    await prisma.referral.update({ where: { id: referral.id }, data: { rewardedAt: now } });
    logger.info({ referrerId: referral.referrerId }, 'Referral reward limit reached');
    return null;
  }

  const owned = await prisma.workspace.findMany({
    where: { memberships: { some: { userId: referral.referrerId, role: 'OWNER' } } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      complimentaryPlan: true,
      complimentaryUntil: true,
      subscriptions: {
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { razorpaySubscriptionId: true },
      },
    },
  });
  if (owned.length === 0) return null;

  const paying = owned.find((workspace) => workspace.subscriptions.length > 0);
  const subscriptionId = paying?.subscriptions[0]?.razorpaySubscriptionId;
  if (paying && subscriptionId) {
    // Throws if Razorpay refuses: the billing job retries, and nothing was marked yet.
    await deps.razorpay.pauseSubscription(subscriptionId);
    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        rewardedAt: now,
        reward: 'paused',
        rewardWorkspaceId: paying.id,
        pausedSubscriptionId: subscriptionId,
        resumeAt: new Date(now.getTime() + REFERRAL_REWARD_DAYS * DAY_MS),
      },
    });
    return { ...given, reward: 'paused', workspaceId: paying.id };
  }

  // A month of Pro on their first workspace, after any complimentary plan it already has.
  const workspace = owned[0];
  if (!workspace) return null;
  const running = workspace.complimentaryUntil && workspace.complimentaryUntil > now;
  const from = running && workspace.complimentaryUntil ? workspace.complimentaryUntil : now;
  const plan =
    running && workspace.complimentaryPlan
      ? higherPlan(workspace.complimentaryPlan, REFERRAL_REWARD_PLAN)
      : REFERRAL_REWARD_PLAN;
  await prisma.$transaction([
    prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        complimentaryPlan: plan,
        complimentaryUntil: new Date(from.getTime() + REFERRAL_REWARD_DAYS * DAY_MS),
      },
    }),
    prisma.referral.update({
      where: { id: referral.id },
      data: { rewardedAt: now, reward: 'complimentary', rewardWorkspaceId: workspace.id },
    }),
  ]);
  return { ...given, reward: 'complimentary', workspaceId: workspace.id };
}

/** The hourly job's part: resumes subscriptions a reward paused, once their month is up. */
export async function resumePausedSubscriptions(deps: RewardDependencies): Promise<number> {
  const { prisma, logger } = deps;
  const now = deps.now?.() ?? new Date();
  const due = await prisma.referral.findMany({
    where: { resumeAt: { lte: now }, resumedAt: null, pausedSubscriptionId: { not: null } },
    select: { id: true, pausedSubscriptionId: true },
  });
  let resumed = 0;
  for (const referral of due) {
    if (!referral.pausedSubscriptionId) continue;
    try {
      await deps.razorpay.resumeSubscription(referral.pausedSubscriptionId);
      await prisma.referral.update({ where: { id: referral.id }, data: { resumedAt: now } });
      resumed += 1;
    } catch (error) {
      // Cancelled or ended meanwhile: nothing to resume, so stop trying.
      if (error instanceof RazorpayError && error.status === 400) {
        await prisma.referral.update({ where: { id: referral.id }, data: { resumedAt: now } });
        logger.warn(
          { err: error, subscription: referral.pausedSubscriptionId },
          'A subscription paused for a referral could not be resumed; left as it is',
        );
        continue;
      }
      // Tried again next hour; one failure must not hold up the others.
      logger.error(
        { err: error, subscription: referral.pausedSubscriptionId },
        'Could not resume a subscription paused for a referral',
      );
    }
  }
  return resumed;
}
