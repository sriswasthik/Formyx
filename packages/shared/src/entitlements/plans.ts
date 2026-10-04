import { z } from 'zod';

/** A workspace's plan, from least to most. There are no payments yet: everyone is on FREE. */
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

/**
 * Where billing stands. A plan counts while ACTIVE, TRIALING (until `trialEndsAt`) and
 * PAST_DUE (a grace period while payment is retried); CANCELED falls back to FREE.
 */
export const PLAN_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED'] as const;
export const planStatusSchema = z.enum(PLAN_STATUSES);
export type PlanStatus = z.infer<typeof planStatusSchema>;

/** What a workspace stores about its plan. */
export interface WorkspaceBilling {
  plan: Plan;
  planStatus: PlanStatus;
  trialEndsAt: Date | null;
}

/** The plan a workspace gets right now: FREE once it is cancelled or its trial has ended. */
export function effectivePlan(billing: WorkspaceBilling, now: Date = new Date()): Plan {
  if (billing.planStatus === 'CANCELED') return 'FREE';
  if (billing.planStatus === 'TRIALING') {
    const trialOver = billing.trialEndsAt === null || billing.trialEndsAt <= now;
    return trialOver ? 'FREE' : billing.plan;
  }
  return billing.plan;
}
