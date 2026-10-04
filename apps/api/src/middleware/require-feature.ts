import type { FeatureId } from '@formyx/shared';
import type { RequestHandler } from 'express';
import type { EntitlementService } from '../services/entitlement-service.js';
import { getMembership } from './auth.js';

/**
 * Refuses with 403 UPGRADE_REQUIRED unless the workspace's plan includes the feature (always
 * passes in `all_unlocked` mode). Must run after `requireWorkspaceRole` or `requireFormRole`,
 * which say which workspace the request is about.
 */
export type RequireFeature = (featureId: FeatureId) => RequestHandler;

export function createRequireFeature(entitlements: EntitlementService): RequireFeature {
  return (featureId) => async (req, _res, next) => {
    await entitlements.assertFeatures(getMembership(req).workspaceId, [featureId]);
    next();
  };
}
