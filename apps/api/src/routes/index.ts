import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { createAuthGuards } from '../middleware/auth.js';
import { createAuthRouter } from './auth.js';
import { createFormsRouter } from './forms.js';
import { healthRouter } from './health.js';

export function createApiRouter(deps: AppDependencies): Router {
  const router = Router();
  const guards = createAuthGuards(deps);

  router.use('/health', healthRouter);
  router.use('/auth', createAuthRouter(deps, guards));
  router.use(createFormsRouter(deps, guards));

  return router;
}
