import { TRIAL_DAYS, TRIAL_PLAN, type EntitlementsMode } from '@formyx/shared';
import type { Database } from '../lib/prisma.js';

/*
 * New workspaces start with a free trial of Pro, no card needed: one trial per account, taken
 * by the first workspace its owner makes. Trials only start where plans are enforced; with
 * everything unlocked they would only count down to nothing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The plan columns of a workspace starting its trial at `now`. */
export function trialPlan(now: Date) {
  return {
    plan: TRIAL_PLAN,
    planStatus: 'TRIALING' as const,
    trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
  };
}

/** Whether new workspaces get trials in this mode. */
export const trialsStart = (mode: EntitlementsMode) => mode === 'enforced';

/**
 * Claims the account's one trial, if it is still there: true once, false ever after, however
 * many workspaces are made at once. Call it in the transaction that makes the workspace.
 */
export async function claimTrial(
  db: Pick<Database, 'user'>,
  userId: string,
  now: Date,
): Promise<boolean> {
  const { count } = await db.user.updateMany({
    where: { id: userId, trialUsedAt: null },
    data: { trialUsedAt: now },
  });
  return count === 1;
}
