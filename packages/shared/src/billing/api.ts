import { z } from 'zod';
import { featureIdSchema } from '../entitlements/features.js';
import { planSchema, planStatusSchema } from '../entitlements/plans.js';
import { billingIntervalSchema, paidPlanSchema } from '../entitlements/pricing.js';

/*
 * The billing endpoints under /api/workspaces/:workspaceId/billing, for workspace owners.
 * Razorpay's webhooks are the source of truth: what the client says about a payment only
 * starts a check.
 */

/** `soft`: responses past the monthly limit are still accepted. `hard`: new visitors are turned away. */
export const ENFORCEMENT_MODES = ['soft', 'hard'] as const;
export const enforcementModeSchema = z.enum(ENFORCEMENT_MODES);
export type EnforcementMode = z.infer<typeof enforcementModeSchema>;

/** A subscription's status, as Razorpay names it. */
export const SUBSCRIPTION_STATUSES = [
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'cancelled',
  'completed',
  'expired',
  'paused',
] as const;
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionSummarySchema = z.object({
  id: z.string(),
  plan: planSchema,
  interval: billingIntervalSchema,
  status: subscriptionStatusSchema,
  currentPeriodStart: z.iso.datetime().nullable(),
  currentPeriodEnd: z.iso.datetime().nullable(),
  /** Ends when the current period does, instead of renewing. */
  cancelAtPeriodEnd: z.boolean(),
});
export type SubscriptionSummary = z.infer<typeof subscriptionSummarySchema>;

/** How much of a limit is used in the current usage period. `limit` null: no limit. */
export const usageMeterSchema = z.object({
  used: z.number().int().min(0),
  limit: z.number().int().min(0).nullable(),
});
export type UsageMeter = z.infer<typeof usageMeterSchema>;

export const usageSchema = z.object({
  /** The billing period when there is a paid one; otherwise the calendar month (UTC). */
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  responses: usageMeterSchema,
  /** Bytes of files respondents uploaded, all time. No plan limits it yet. */
  storageBytes: usageMeterSchema,
});
export type Usage = z.infer<typeof usageSchema>;

/** A form drawn or run differently on the current plan, and the features behind it. */
export const downgradedFormSchema = z.object({
  formId: z.string(),
  title: z.string(),
  features: z.array(featureIdSchema).min(1),
});
export type DowngradedForm = z.infer<typeof downgradedFormSchema>;

/** What changed when the workspace last fell back to Free, until the owner dismisses it. */
export const downgradeSchema = z.object({
  from: planSchema,
  at: z.iso.datetime(),
  forms: z.array(downgradedFormSchema),
});
export type Downgrade = z.infer<typeof downgradeSchema>;

/** `GET /api/workspaces/:workspaceId/billing`. */
export const billingSummarySchema = z.object({
  plan: planSchema,
  /** The plan in force right now (a trial that ended counts as Free). */
  effectivePlan: planSchema,
  planStatus: planStatusSchema,
  trialEndsAt: z.iso.datetime().nullable(),
  graceEndsAt: z.iso.datetime().nullable(),
  complimentaryPlan: planSchema.nullable(),
  complimentaryUntil: z.iso.datetime().nullable(),
  /** The latest subscription, if there has been one. */
  subscription: subscriptionSummarySchema.nullable(),
  usage: usageSchema,
  downgrade: downgradeSchema.nullable(),
  enforcement: enforcementModeSchema,
  /** Whether payments are set up on this server (Razorpay keys and plans). */
  checkoutAvailable: z.boolean(),
});
export type BillingSummary = z.infer<typeof billingSummarySchema>;

/** Body of `POST .../billing/subscribe` and `POST .../billing/change-plan`. */
export const subscribeInputSchema = z.object({
  plan: paidPlanSchema,
  interval: billingIntervalSchema,
});
export type SubscribeInput = z.infer<typeof subscribeInputSchema>;

/** What Razorpay Checkout needs to open for a new subscription. */
export const checkoutSchema = z.object({
  /** Razorpay's id, `sub_...`. */
  subscriptionId: z.string(),
  /** The public key Checkout opens with. */
  keyId: z.string(),
  plan: paidPlanSchema,
  interval: billingIntervalSchema,
  /** In paise. */
  amount: z.number().int(),
  currency: z.literal('INR'),
  prefill: z.object({ name: z.string(), email: z.string() }),
});
export type Checkout = z.infer<typeof checkoutSchema>;

/** Body of `POST .../billing/verify`: what Razorpay Checkout hands back. */
export const verifyCheckoutInputSchema = z.object({
  razorpayPaymentId: z.string().regex(/^pay_\w+$/, 'Not a Razorpay payment id'),
  razorpaySubscriptionId: z.string().regex(/^sub_\w+$/, 'Not a Razorpay subscription id'),
  razorpaySignature: z.string().regex(/^[0-9a-f]{64}$/, 'Not a Razorpay signature'),
});
export type VerifyCheckoutInput = z.infer<typeof verifyCheckoutInputSchema>;

/** The answer to `POST .../billing/verify`. */
export const verifyCheckoutResponseSchema = z.object({
  /** `active`: the webhook has already come. `confirming`: it is on its way. */
  status: z.enum(['active', 'confirming']),
});
export type VerifyCheckoutResponse = z.infer<typeof verifyCheckoutResponseSchema>;

export const CANCEL_REASONS = [
  'too_expensive',
  'missing_feature',
  'not_using',
  'switching',
  'other',
] as const;
export const cancelReasonSchema = z.enum(CANCEL_REASONS);
export type CancelReason = z.infer<typeof cancelReasonSchema>;

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  too_expensive: 'It costs too much',
  missing_feature: 'Something I need is missing',
  not_using: "I'm not using it enough",
  switching: "I'm moving to another tool",
  other: 'Something else',
};

/** Body of `POST .../billing/cancel`. The reason is optional and only helps us. */
export const cancelInputSchema = z.object({
  reason: cancelReasonSchema.optional(),
  details: z.string().trim().max(500, 'Keep it under 500 characters').optional(),
});
export type CancelInput = z.infer<typeof cancelInputSchema>;

export const paymentSchema = z.object({
  id: z.string(),
  /** In paise. */
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum(['paid', 'failed']),
  paidAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  invoiceUrl: z.url().nullable(),
  failureReason: z.string().nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;

/** `GET .../billing/payments`. */
export const paymentsResponseSchema = z.object({ payments: z.array(paymentSchema) });
export type PaymentsResponse = z.infer<typeof paymentsResponseSchema>;
