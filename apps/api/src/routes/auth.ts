import { loginInputSchema, registerInputSchema } from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { AppError } from '../lib/app-error.js';
import { createPasswordHasher } from '../lib/password.js';
import { clearSessionCookie, setSessionCookie } from '../lib/session.js';
import { getAuth, type AuthGuards } from '../middleware/auth.js';
import { createAuthRateLimiters } from '../middleware/rate-limit.js';
import { createAuthService } from '../services/auth-service.js';

export function createAuthRouter(
  { env, prisma }: AppDependencies,
  { requireAuth }: AuthGuards,
): Router {
  const router = Router();
  const auth = createAuthService({ prisma, passwords: createPasswordHasher(env.BCRYPT_COST) });
  const limit = createAuthRateLimiters(env);

  // These responses carry personal data or set the session cookie: never cache them.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/register', limit.register, async (req, res) => {
    const me = await auth.register(registerInputSchema.parse(req.body));
    setSessionCookie(res, me.user.id, env);
    res.status(201).json(me);
  });

  router.post('/login', limit.login, async (req, res) => {
    const me = await auth.logIn(loginInputSchema.parse(req.body));
    setSessionCookie(res, me.user.id, env);
    res.json(me);
  });

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res, env);
    res.status(204).end();
  });

  router.get('/me', requireAuth, async (req, res) => {
    const me = await auth.getMe(getAuth(req).userId);
    if (!me) {
      // A valid token for a user that no longer exists: drop the stale cookie.
      clearSessionCookie(res, env);
      throw new AppError(401, 'UNAUTHORIZED', 'Log in to continue');
    }
    res.json(me);
  });

  return router;
}
