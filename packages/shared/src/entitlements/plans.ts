import { z } from 'zod';

/** A workspace's plan, from least to most. Prices are in pricing.ts. */
export const PLANS = ['FREE', 'PRO', 'BUSINESS'] as const;
export const planSchema = z.enum(PLANS);
export type Plan = z.infer<typeof planSchema>;

export const PLAN_LABELS: Record<Plan, string> = {
  FREE: 'Free',
  PRO: 'Pro',
  BUSINESS: 'Business',
};

const PLAN_RANK: Record<Plan, number> = { FREE: 0, PRO: 1, BUSINESS: 2 };

/** Whether `plan` includes everything `minPlan` does. */
export function planIncludes(plan: Plan, minPlan: Plan): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[minPlan];
}

/** The plan with everything, which `all_unlocked` mode gives every workspace. */
export const TOP_PLAN: Plan = 'BUSINESS';

/** The higher of two plans. */
export function higherPlan(a: Plan, b: Plan): Plan {
  return PLAN_RANK[a] >= PLAN_RANK[b] ? a : b;
}

/**
 * Where billing stands. A plan counts while ACTIVE, TRIALING (until `trialEndsAt`) and
 * PAST_DUE (until `graceEndsAt`, while payment is retried); CANCELED falls back to FREE.
 */
export const PLAN_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED'] as const;
export const planStatusSchema = z.enum(PLAN_STATUSES);
export type PlanStatus = z.infer<typeof planStatusSchema>;

/** What a workspace stores about its plan. */
export interface WorkspaceBilling {
  plan: Plan;
  planStatus: PlanStatus;
  trialEndsAt: Date | null;
  /** When a PAST_DUE plan falls back to FREE; no end if not set. */
  graceEndsAt?: Date | null;
  /** A plan given by an admin (testers, friends), on top of whatever is paid for. */
  complimentaryPlan?: Plan | null;
  /** When the complimentary plan ends. */
  complimentaryUntil?: Date | null;
}

/** The plan the workspace's own billing gives it, before any complimentary plan. */
function billedPlan(billing: WorkspaceBilling, now: Date): Plan {
  switch (billing.planStatus) {
    case 'CANCELED':
      return 'FREE';
    case 'TRIALING':
      return billing.trialEndsAt && billing.trialEndsAt > now ? billing.plan : 'FREE';
    case 'PAST_DUE':
      return !billing.graceEndsAt || billing.graceEndsAt > now ? billing.plan : 'FREE';
    case 'ACTIVE':
      return billing.plan;
  }
}

/** Whether a complimentary plan is in force. */
export function hasComplimentaryPlan(billing: WorkspaceBilling, now: Date = new Date()): boolean {
  return Boolean(
    billing.complimentaryPlan && billing.complimentaryUntil && billing.complimentaryUntil > now,
  );
}

/**
 * The plan a workspace gets right now: FREE once it is cancelled, its trial has ended or its
 * grace period after a failed payment has run out; at least its complimentary plan while that
 * lasts. Never depends on a scheduled job having run.
 */
export function effectivePlan(billing: WorkspaceBilling, now: Date = new Date()): Plan {
  const billed = billedPlan(billing, now);
  return hasComplimentaryPlan(billing, now) && billing.complimentaryPlan
    ? higherPlan(billed, billing.complimentaryPlan)
    : billed;
}
