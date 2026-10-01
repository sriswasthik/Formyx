import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { createAuthGuards } from '../middleware/auth.js';
import { createAnalyticsRouter } from './analytics.js';
import { createAuthRouter } from './auth.js';
import { createFormsRouter } from './forms.js';
import { healthRouter } from './health.js';
import { createPublicFormsRouter } from './public-forms.js';
import { createSubmissionsRouter } from './submissions.js';

export function createApiRouter(deps: AppDependencies): Router {
  const router = Router();
  const guards = createAuthGuards(deps);

  router.use('/health', healthRouter);
  router.use('/auth', createAuthRouter(deps, guards));
  router.use('/public/forms', createPublicFormsRouter(deps));
  // The forms router goes first: it marks everything under /forms as not cacheable.
  router.use(createFormsRouter(deps, guards));
  router.use(createSubmissionsRouter(deps, guards));
  router.use(createAnalyticsRouter(deps, guards));

  return router;
}
