import {
  effectivePlan,
  FEATURES,
  hasFeature,
  missingFeatures,
  resolveEntitlements,
  type Entitlements,
  type EntitlementsMode,
  type FeatureId,
  type UpgradeRequiredDetails,
} from '@formyx/shared';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';

export interface EntitlementService {
  /** What the workspace may use right now. 404 if it does not exist. */
  forWorkspace(workspaceId: string): Promise<Entitlements>;
  /** Throws 403 UPGRADE_REQUIRED, listing what is missing, unless the plan includes them all. */
  assertFeatures(workspaceId: string, featureIds: readonly FeatureId[]): Promise<void>;
}

/** The 403 for features a plan lacks. `details.features` lets clients explain the upgrade. */
export function upgradeRequired(features: FeatureId[]): AppError {
  const details: UpgradeRequiredDetails = { features };
  const names = features.map((id) => FEATURES[id].name).join(', ');
  return new AppError(403, 'UPGRADE_REQUIRED', `Your plan does not include: ${names}.`, {
    details,
  });
}

/** The workspace columns its plan comes from (see `effectivePlan`). */
export const WORKSPACE_BILLING_SELECT = {
  plan: true,
  planStatus: true,
  trialEndsAt: true,
  graceEndsAt: true,
  complimentaryPlan: true,
  complimentaryUntil: true,
} as const;

/**
 * Whether the workspace that owns `formId` may use `featureId` right now. Work a feature does
 * in the background (emails, chat posts, syncing) checks this as it happens: after a plan
 * ends it pauses, with its settings kept for when the plan comes back.
 */
export async function formAllows(
  prisma: Database,
  mode: EntitlementsMode,
  formId: string,
  featureId: FeatureId,
  now: Date = new Date(),
): Promise<boolean> {
  if (mode === 'all_unlocked') return true;
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { workspace: { select: WORKSPACE_BILLING_SELECT } },
  });
  return form ? hasFeature(effectivePlan(form.workspace, now), featureId) : false;
}

export function createEntitlementService(
  prisma: Database,
  mode: EntitlementsMode,
  now: () => Date = () => new Date(),
): EntitlementService {
  async function forWorkspace(workspaceId: string): Promise<Entitlements> {
    const billing = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: WORKSPACE_BILLING_SELECT,
    });
    if (!billing) throw new AppError(404, 'NOT_FOUND', 'Workspace not found');
    return resolveEntitlements(billing, mode, now());
  }

  return {
    forWorkspace,

    async assertFeatures(workspaceId, featureIds) {
      // Nothing to look up when nothing is needed or everything is unlocked.
      if (featureIds.length === 0 || mode === 'all_unlocked') return;
      const missing = missingFeatures(await forWorkspace(workspaceId), featureIds);
      if (missing.length > 0) throw upgradeRequired(missing);
    },
  };
}
