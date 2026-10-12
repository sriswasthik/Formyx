import { GRACE_DAYS, isPaidPlan, type Plan } from '@formyx/shared';
import type { Database } from '../lib/prisma.js';

/*
 * The ways a workspace's plan changes, in one place for webhooks, the hourly job and admins.
 * None of them touches forms or responses: on Free a form is only drawn and run differently
 * (see themeForFeatures), so going back to a paid plan restores everything.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A Prisma client or a transaction. */
type Db = Pick<Database, 'workspace'>;

/** A paid plan starts or renews: whatever trial, grace period or downgrade there was is over. */
export async function activatePlan(db: Db, workspaceId: string, plan: Plan): Promise<void> {
  await db.workspace.update({
    where: { id: workspaceId },
    data: {
      plan,
      planStatus: 'ACTIVE',
      trialEndsAt: null,
      graceEndsAt: null,
      downgradedFrom: null,
      downgradedAt: null,
    },
  });
}

/**
 * A renewal failed: the plan keeps working for GRACE_DAYS from the first failure. Later
 * failures in the same stretch don't move the end. Returns when the grace period ends.
 */
export async function markPastDue(db: Db, workspaceId: string, failedAt: Date): Promise<Date> {
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { planStatus: true, graceEndsAt: true },
  });
  if (workspace.planStatus === 'PAST_DUE' && workspace.graceEndsAt) return workspace.graceEndsAt;
  const graceEndsAt = new Date(failedAt.getTime() + GRACE_DAYS * DAY_MS);
  await db.workspace.update({
    where: { id: workspaceId },
    data: { planStatus: 'PAST_DUE', graceEndsAt },
  });
  return graceEndsAt;
}

/**
 * Moves the workspace to Free, remembering the paid plan it leaves so the owner can see what
 * changed. Returns that plan, or null when it was not on one (nothing to say).
 */
export async function downgradeToFree(
  db: Db,
  workspaceId: string,
  now: Date,
): Promise<Plan | null> {
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { plan: true, planStatus: true },
  });
  const from = isPaidPlan(workspace.plan) ? workspace.plan : null;
  if (!from && workspace.planStatus === 'ACTIVE') return null;
  await db.workspace.update({
    where: { id: workspaceId },
    data: {
      plan: 'FREE',
      planStatus: 'ACTIVE',
      trialEndsAt: null,
      graceEndsAt: null,
      ...(from ? { downgradedFrom: from, downgradedAt: now } : {}),
    },
  });
  return from;
}
