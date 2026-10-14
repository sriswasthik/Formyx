import { z } from 'zod';
import { getLimit, hasFeature } from './entitlements.js';
import { FEATURES, LIMITS, type FeatureId, type LimitId, type LimitValue } from './features.js';
import { PLANS, type Plan } from './plans.js';

/*
 * What each plan costs, and the comparison the pricing page, the upgrade dialog and the billing
 * settings show. Names, descriptions and which plan includes what come from the feature and
 * limit registry, so what is sold, shown and enforced can never disagree.
 */

/** Every price is in Indian rupees. */
export const CURRENCY = 'INR';

export const BILLING_INTERVALS = ['monthly', 'yearly'] as const;
export const billingIntervalSchema = z.enum(BILLING_INTERVALS);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

/** The plans someone can pay for. */
export const PAID_PLANS = ['PRO', 'BUSINESS'] as const satisfies readonly Plan[];
export const paidPlanSchema = z.enum(PAID_PLANS);
export type PaidPlan = z.infer<typeof paidPlanSchema>;

/**
 * Prices in paise (a hundredth of a rupee), as Razorpay takes them. Yearly is ten months'
 * price: two months free. The Razorpay plans must match: `billing:sync-plans` checks.
 */
export const PRICES: Record<PaidPlan, Record<BillingInterval, number>> = {
  PRO: { monthly: 29_900, yearly: 299_000 },
  BUSINESS: { monthly: 99_900, yearly: 999_000 },
};

/** The environment variable holding a plan's Razorpay plan id, e.g. RAZORPAY_PLAN_PRO_MONTHLY. */
export function razorpayPlanEnv(plan: PaidPlan, interval: BillingInterval): string {
  return `RAZORPAY_PLAN_${plan}_${interval.toUpperCase()}`;
}

/** Whether `plan` is one someone can pay for. */
export function isPaidPlan(plan: Plan): plan is PaidPlan {
  return (PAID_PLANS as readonly Plan[]).includes(plan);
}

/** What paying yearly saves over twelve monthly payments, in paise and in percent. */
export function yearlySaving(plan: PaidPlan): { amount: number; percent: number } {
  const twelveMonths = PRICES[plan].monthly * 12;
  const amount = twelveMonths - PRICES[plan].yearly;
  return { amount, percent: Math.round((amount / twelveMonths) * 100) };
}

/** An amount in paise as rupees, e.g. 299000 → "₹2,990" (paise shown only when there are some). */
export function formatInr(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/** How long a new workspace's trial lasts. */
export const TRIAL_DAYS = 30;
/** The plan a trial gives. */
export const TRIAL_PLAN: PaidPlan = 'PRO';
/** Days before a trial ends that its owner is reminded. */
export const TRIAL_REMINDER_DAYS = [7, 3, 1] as const;
/** How long a plan keeps working after a renewal fails, while payment is retried. */
export const GRACE_DAYS = 7;
/** Shares of a usage limit at which the owner is warned. */
export const USAGE_WARNING_THRESHOLDS = [0.8, 1] as const;

/** One line under each plan's name. */
export const PLAN_TAGLINES: Record<Plan, string> = {
  FREE: 'For trying Formyx and small forms.',
  PRO: 'For creators and small teams who want their forms to look their own.',
  BUSINESS: 'For teams collecting at scale, with no response limit.',
};

/** The comparison table's sections, in order. */
export const PRICING_FEATURE_GROUPS: { title: string; features: FeatureId[] }[] = [
  {
    title: 'Design',
    features: [
      'premium_fonts',
      'premium_textures',
      'mesh_gradients',
      'custom_shapes',
      'conversational_layout',
      'remove_branding',
      'custom_social',
    ],
  },
  {
    title: 'Logic and responses',
    features: ['advanced_logic', 'quiz_mode', 'verified_responses', 'excel_export'],
  },
  {
    title: 'Notifications and integrations',
    features: [
      'autoresponder',
      'extra_recipients',
      'chat_notifications',
      'google_sheets',
      'notion',
    ],
  },
];

/**
 * Features in the registry that are not sold yet because they are not built: the pricing page
 * leaves them out rather than promise them.
 */
export const UNLISTED_FEATURES: readonly FeatureId[] = ['ai_generate', 'ai_insights'];

/** The limits the comparison shows, in order. */
export const PRICING_LIMITS: LimitId[] = [
  'responses_per_month',
  'file_upload_size_mb',
  'brand_kits',
];

/** A limit as the comparison shows it, e.g. "10,000" or "Unlimited". */
export function formatLimit(limitId: LimitId, value: LimitValue): string {
  if (value === null) return 'Unlimited';
  const amount = new Intl.NumberFormat('en-IN').format(value);
  return LIMITS[limitId].unit === 'MB' ? `${amount} MB` : amount;
}

export interface ComparisonRow {
  id: FeatureId | LimitId;
  name: string;
  description?: string;
  /** Per plan: whether it is included, or the limit as text. */
  values: Record<Plan, boolean | string>;
}

/** The comparison table: limits first, then each group of features. */
export function planComparison(): { title: string; rows: ComparisonRow[] }[] {
  const limits = PRICING_LIMITS.map((limitId) => ({
    id: limitId,
    name: LIMITS[limitId].name,
    values: Object.fromEntries(
      PLANS.map((plan) => [plan, formatLimit(limitId, getLimit(plan, limitId))]),
    ) as Record<Plan, string>,
  }));
  return [
    { title: 'Limits', rows: limits },
    ...PRICING_FEATURE_GROUPS.map(({ title, features }) => ({
      title,
      rows: features.map((featureId) => ({
        id: featureId,
        name: FEATURES[featureId].name,
        description: FEATURES[featureId].description,
        values: Object.fromEntries(
          PLANS.map((plan) => [plan, hasFeature(plan, featureId)]),
        ) as Record<Plan, boolean>,
      })),
    })),
  ];
}

/** A plan's features beyond the plan below it, for plan cards ("Everything in Free, plus"). */
export function newFeatures(plan: Plan): FeatureId[] {
  const below = PLANS[PLANS.indexOf(plan) - 1];
  return PRICING_FEATURE_GROUPS.flatMap(({ features }) => features).filter(
    (featureId) => hasFeature(plan, featureId) && (!below || !hasFeature(below, featureId)),
  );
}
