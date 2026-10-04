import {
  FEATURES,
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

export function createEntitlementService(
  prisma: Database,
  mode: EntitlementsMode,
  now: () => Date = () => new Date(),
): EntitlementService {
  async function forWorkspace(workspaceId: string): Promise<Entitlements> {
    const billing = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { plan: true, planStatus: true, trialEndsAt: true },
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
