import {
  BILLING_INTERVALS,
  CURRENCY,
  formatInr,
  PAID_PLANS,
  PLAN_LABELS,
  PRICES,
  razorpayPlanEnv,
  type BillingInterval,
  type PaidPlan,
} from '@formyx/shared';
import {
  razorpayPlanIds,
  RazorpayError,
  type RazorpayClient,
  type RazorpayEnv,
} from './razorpay.js';

/*
 * Checks that each configured Razorpay plan exists and charges what pricing.ts says, every
 * month or every year, so what Checkout charges and what the pricing page says can't drift.
 * With `create`, makes the missing ones (test mode) and says which ids to set.
 */

export interface PlanCheck {
  plan: PaidPlan;
  interval: BillingInterval;
  /** The environment variable to set, e.g. RAZORPAY_PLAN_PRO_MONTHLY. */
  env: string;
  planId: string | null;
  /** What is wrong; null when the plan matches. */
  problem: string | null;
  /** Made by this run. */
  created: boolean;
}

export async function checkRazorpayPlans(
  env: RazorpayEnv,
  razorpay: RazorpayClient,
  { create = false }: { create?: boolean } = {},
): Promise<PlanCheck[]> {
  const ids = razorpayPlanIds(env);
  const checks: PlanCheck[] = [];
  for (const plan of PAID_PLANS) {
    for (const interval of BILLING_INTERVALS) {
      const name = razorpayPlanEnv(plan, interval);
      const amount = PRICES[plan][interval];
      const planId = ids[plan][interval] ?? null;
      if (!planId) {
        if (create) {
          const made = await razorpay.createPlan({
            period: interval,
            amount,
            name: `Formyx ${PLAN_LABELS[plan]} (${interval})`,
            description: `${formatInr(amount)} ${interval === 'monthly' ? 'a month' : 'a year'}`,
          });
          checks.push({ plan, interval, env: name, planId: made.id, problem: null, created: true });
        } else {
          checks.push({ plan, interval, env: name, planId, problem: 'Not set', created: false });
        }
        continue;
      }
      let problem: string | null = null;
      try {
        const found = await razorpay.fetchPlan(planId);
        const want = `${formatInr(amount)} ${CURRENCY} every ${interval === 'monthly' ? 'month' : 'year'}`;
        if (
          found.period !== interval ||
          found.interval !== 1 ||
          found.item.amount !== amount ||
          found.item.currency !== CURRENCY
        ) {
          const every =
            found.interval === 1 ? found.period : `${String(found.interval)} × ${found.period}`;
          problem = `Charges ${formatInr(found.item.amount)} ${found.item.currency} ${every}; should be ${want}`;
        }
      } catch (error) {
        problem =
          error instanceof RazorpayError && error.status === 400
            ? 'Razorpay has no plan with this id'
            : `Could not check it: ${error instanceof Error ? error.message : String(error)}`;
      }
      checks.push({ plan, interval, env: name, planId, problem, created: false });
    }
  }
  return checks;
}
