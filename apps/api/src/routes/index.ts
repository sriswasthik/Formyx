import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { healthRouter } from './health.js';

export function createApiRouter(_deps: AppDependencies): Router {
  const router = Router();

  router.use('/health', healthRouter);

  return router;
}
