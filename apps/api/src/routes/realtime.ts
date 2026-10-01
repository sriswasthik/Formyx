import type { RealtimeTokenResponse } from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { signRealtimeToken } from '../lib/realtime-token.js';
import { getAuth, type AuthGuards } from '../middleware/auth.js';

export function createRealtimeRouter(
  { env }: AppDependencies,
  { requireAuth }: AuthGuards,
): Router {
  const router = Router();

  /** A one-minute token for opening a live-updates socket, which may be on another origin. */
  router.get('/token', requireAuth, (req, res) => {
    const { token, expiresAt } = signRealtimeToken(getAuth(req).userId, env.JWT_SECRET);
    const body: RealtimeTokenResponse = { token, expiresAt: expiresAt.toISOString() };
    res.set('Cache-Control', 'no-store');
    res.json(body);
  });

  return router;
}
