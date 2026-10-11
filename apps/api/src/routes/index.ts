import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { createAuthGuards, type AuthGuards } from '../middleware/auth.js';
import { createRequireFeature, type RequireFeature } from '../middleware/require-feature.js';
import { createEntitlementService } from '../services/entitlement-service.js';
import { createAccountRouter } from './account.js';
import { createAnalyticsRouter } from './analytics.js';
import { createAuthRouter } from './auth.js';
import { createBrandKitsRouter } from './brand-kits.js';
import { createFormSettingsRouter } from './form-settings.js';
import { createFormsRouter } from './forms.js';
import { healthRouter } from './health.js';
import { createNotificationsRouter } from './notifications.js';
import { createPinCodesRouter } from './pin-codes.js';
import { createPublicFormsRouter } from './public-forms.js';
import { createRealtimeRouter } from './realtime.js';
import { createSubmissionsRouter } from './submissions.js';
import { createUploadsRouter } from './uploads.js';
import { createWebhooksRouter } from './webhooks.js';
import { createWorkspacesRouter } from './workspaces.js';

/** The checks routes run before their handlers: who is asking, and what their plan includes. */
export interface Guards extends AuthGuards {
  requireFeature: RequireFeature;
}

export function createApiRouter(deps: AppDependencies): Router {
  const router = Router();
  const entitlements = createEntitlementService(deps.prisma, deps.env.ENTITLEMENTS_MODE);
  const guards: Guards = {
    ...createAuthGuards(deps),
    requireFeature: createRequireFeature(entitlements),
  };

  router.use('/health', healthRouter);
  router.use('/auth', createAuthRouter(deps, guards));
  router.use('/realtime', createRealtimeRouter(deps, guards));
  router.use('/public/forms', createPublicFormsRouter(deps));
  router.use('/public/pincodes', createPinCodesRouter(deps));
  router.use('/uploads', createUploadsRouter(deps, guards));
  // The forms router goes first: it marks everything under /forms as not cacheable.
  router.use(createFormsRouter(deps, guards));
  router.use(createFormSettingsRouter(deps, guards));
  router.use(createSubmissionsRouter(deps, guards));
  router.use(createAnalyticsRouter(deps, guards));
  router.use(createNotificationsRouter(deps, guards));
  router.use(createWorkspacesRouter(deps, guards));
  router.use(createAccountRouter(deps, guards));
  router.use(createBrandKitsRouter(deps, guards));
  router.use(createWebhooksRouter(deps, guards));

  return router;
}
