import type { HealthResponse } from '@formyx/shared';
import { Router } from 'express';

export function createHealthRouter(): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
    res.set('Cache-Control', 'no-store').json(body);
  });
  return router;
}
