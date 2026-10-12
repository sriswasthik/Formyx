import { z } from 'zod';
import {
  FEATURE_IDS,
  FEATURES,
  featureIdSchema,
  LIMIT_IDS,
  limitIdSchema,
  LIMITS,
  type FeatureId,
  type LimitId,
  type LimitValue,
} from './features.js';
import {
  effectivePlan,
  hasComplimentaryPlan,
  planIncludes,
  planSchema,
  planStatusSchema,
  TOP_PLAN,
  type Plan,
  type WorkspaceBilling,
} from './plans.js';

/** Whether `plan` includes the feature. The one place plans and features meet. */
export function hasFeature(plan: Plan, featureId: FeatureId): boolean {
  return planIncludes(plan, FEATURES[featureId].minPlan);
}

/** How much of something `plan` allows; `null` means no limit. */
export function getLimit(plan: Plan, limitId: LimitId): LimitValue {
  return LIMITS[limitId].values[plan];
}

/**
 * `all_unlocked`: everyone gets everything (development and the beta). `enforced`: each
 * workspace gets what its plan includes. Set with the API's ENTITLEMENTS_MODE.
 */
export const ENTITLEMENTS_MODES = ['all_unlocked', 'enforced'] as const;
export const entitlementsModeSchema = z.enum(ENTITLEMENTS_MODES);
export type EntitlementsMode = z.infer<typeof entitlementsModeSchema>;

/** What `GET /api/workspaces/:workspaceId/entitlements` returns. */
export const entitlementsSchema = z.object({
  mode: entitlementsModeSchema,
  /** The plan the workspace is on, as stored. */
  plan: planSchema,
  /** The plan it gets right now (see `effectivePlan`), whatever the mode. */
  effectivePlan: planSchema,
  planStatus: planStatusSchema,
  trialEndsAt: z.iso.datetime().nullable(),
  /** When a PAST_DUE plan falls back to FREE. */
  graceEndsAt: z.iso.datetime().nullable(),
  /** A plan given by an admin, while it lasts. */
  complimentaryPlan: planSchema.nullable(),
  complimentaryUntil: z.iso.datetime().nullable(),
  features: z.record(featureIdSchema, z.boolean()),
  limits: z.record(limitIdSchema, z.number().int().nullable()),
});
export type Entitlements = z.infer<typeof entitlementsSchema>;

/**
 * What a workspace may use right now: its effective plan's features and limits, or
 * everything in `all_unlocked` mode.
 */
export function resolveEntitlements(
  billing: WorkspaceBilling,
  mode: EntitlementsMode,
  now: Date = new Date(),
): Entitlements {
  const effective = effectivePlan(billing, now);
  const plan = mode === 'all_unlocked' ? TOP_PLAN : effective;
  const complimentary = hasComplimentaryPlan(billing, now);
  return {
    mode,
    plan: billing.plan,
    effectivePlan: effective,
    planStatus: billing.planStatus,
    trialEndsAt: billing.trialEndsAt?.toISOString() ?? null,
    graceEndsAt: billing.graceEndsAt?.toISOString() ?? null,
    complimentaryPlan: complimentary ? (billing.complimentaryPlan ?? null) : null,
    complimentaryUntil: complimentary ? (billing.complimentaryUntil?.toISOString() ?? null) : null,
    features: Object.fromEntries(
      FEATURE_IDS.map((featureId) => [featureId, hasFeature(plan, featureId)]),
    ) as Record<FeatureId, boolean>,
    limits: Object.fromEntries(
      LIMIT_IDS.map((limitId) => [limitId, getLimit(plan, limitId)]),
    ) as Record<LimitId, LimitValue>,
  };
}

/** The features in `featureIds` that `entitlements` does not include, in registry order. */
export function missingFeatures(
  entitlements: Pick<Entitlements, 'features'>,
  featureIds: readonly FeatureId[],
): FeatureId[] {
  return FEATURE_IDS.filter((id) => featureIds.includes(id) && !entitlements.features[id]);
}

/** `details` of the 403 UPGRADE_REQUIRED: the features the request needs. */
export const upgradeRequiredDetailsSchema = z.object({
  features: z.array(featureIdSchema).min(1),
});
export type UpgradeRequiredDetails = z.infer<typeof upgradeRequiredDetailsSchema>;
