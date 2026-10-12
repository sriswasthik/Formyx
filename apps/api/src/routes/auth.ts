import { loginInputSchema, registerInputSchema, TRIAL_PLAN } from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { trialsStart } from '../billing/trial.js';
import { createDemoAccounts } from '../demo/demo-seed.js';
import { AppError } from '../lib/app-error.js';
import { createPasswordHasher } from '../lib/password.js';
import { clearSessionCookie, setSessionCookie } from '../lib/session.js';
import { getAuth, type AuthGuards } from '../middleware/auth.js';
import { createAuthRateLimiters } from '../middleware/rate-limit.js';
import { createAuthService } from '../services/auth-service.js';

export function createAuthRouter(
  { env, prisma, analytics }: AppDependencies,
  { requireAuth }: AuthGuards,
): Router {
  const router = Router();
  const auth = createAuthService({
    prisma,
    passwords: createPasswordHasher(env.BCRYPT_COST),
    mode: env.ENTITLEMENTS_MODE,
  });
  const limit = createAuthRateLimiters(env);
  const demo = createDemoAccounts(prisma);

  /** Signs `userId` in, at their current password, so a later change signs this out. */
  async function signIn(res: Parameters<typeof setSessionCookie>[0], userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordVersion: true },
    });
    setSessionCookie(res, userId, env, user?.passwordVersion ?? 0);
  }

  // These responses carry personal data or set the session cookie: never cache them.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/register', limit.register, async (req, res) => {
    const me = await auth.register(registerInputSchema.parse(req.body));
    await signIn(res, me.user.id);
    const actor = { userId: me.user.id, workspaceId: me.workspaces[0]?.id };
    analytics.track({ name: 'signed_up' }, actor);
    if (trialsStart(env.ENTITLEMENTS_MODE)) {
      analytics.track({ name: 'trial_started', properties: { targetPlan: TRIAL_PLAN } }, actor);
    }
    res.status(201).json(me);
  });

  router.post('/login', limit.login, async (req, res) => {
    const me = await auth.logIn(loginInputSchema.parse(req.body));
    await signIn(res, me.user.id);
    res.json(me);
  });

  // Signs in to the shared demo account, setting it up on first use.
  router.post('/demo', limit.demo, async (_req, res) => {
    if (!env.DEMO_ENABLED) {
      throw new AppError(404, 'NOT_FOUND', 'The demo is not available on this server');
    }
    const userId = await demo.userId();
    const me = await auth.getMe(userId);
    if (!me) throw new Error('The demo account disappeared while signing in');
    await signIn(res, userId);
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
