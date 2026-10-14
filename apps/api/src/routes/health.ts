import type { HealthResponse, ReadinessResponse } from '@formyx/shared';
import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Database } from '../lib/prisma.js';

/** How long the database gets to answer before the API counts as unavailable. */
export const READINESS_TIMEOUT_MS = 2000;
/** Uptime monitors check every minute or so; this leaves room for several. */
const READINESS_CHECKS_PER_15_MINUTES = 120;

async function databaseAnswers(prisma: Database): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      resolve(false);
    }, READINESS_TIMEOUT_MS);
  });
  try {
    return await Promise.race([prisma.$queryRaw`SELECT 1`.then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `GET /api/health`: the process is up (Render's health check, which restarts it otherwise).
 * `GET /api/health/ready`: it can also reach the database, for uptime monitoring and alerts.
 */
export function createHealthRouter({ prisma }: { prisma: Database }): Router {
  const router = Router();
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: READINESS_CHECKS_PER_15_MINUTES,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  router.get('/', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.get('/ready', limit, async (_req, res) => {
    const ok = await databaseAnswers(prisma);
    const body: ReadinessResponse = {
      status: ok ? 'ready' : 'unavailable',
      database: ok ? 'ok' : 'down',
      timestamp: new Date().toISOString(),
    };
    res
      .status(ok ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json(body);
  });

  return router;
}
