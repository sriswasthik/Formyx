import {
  accountPreferencesSchema,
  changePasswordInputSchema,
  deleteAccountInputSchema,
  readWorkspacePreferences,
  updateOnboardingInputSchema,
  workspacePreferencesSchema,
  type AccountPreferences,
  type OnboardingResponse,
  type WorkspacePreferences,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { createPasswordHasher } from '../lib/password.js';
import { clearSessionCookie, setSessionCookie } from '../lib/session.js';
import { createAuthRateLimiters } from '../middleware/rate-limit.js';
import { getAuth, getMembership, type AuthGuards } from '../middleware/auth.js';
import { createAccountService } from '../services/account-service.js';
import { createOnboardingService } from '../services/onboarding-service.js';

/**
 * The signed-in person's own preferences and account, and a workspace's preferences (read
 * by its members, changed by its owners).
 */
export function createAccountRouter(
  { env, prisma }: AppDependencies,
  { requireAuth, requireRealAccount, requireWorkspaceRole }: AuthGuards,
): Router {
  const router = Router();
  const accounts = createAccountService({
    prisma,
    passwords: createPasswordHasher(env.BCRYPT_COST),
  });
  const onboarding = createOnboardingService(prisma);
  // The same limits as logging in: these take the current password.
  const limit = createAuthRateLimiters(env);

  router.get('/account/preferences', requireAuth, async (req, res) => {
    const body: AccountPreferences = await accounts.preferences(getAuth(req).userId);
    res.json(body);
  });

  router.put('/account/preferences', requireAuth, async (req, res) => {
    const input = accountPreferencesSchema.parse(req.body);
    const body: AccountPreferences = await accounts.setPreferences(getAuth(req).userId, input);
    res.json(body);
  });

  // The welcome after sign-up and the getting-started checklist.
  router.get('/account/onboarding', requireAuth, async (req, res) => {
    const body: OnboardingResponse = await onboarding.get(getAuth(req).userId);
    res.json(body);
  });

  router.patch('/account/onboarding', requireAuth, async (req, res) => {
    const input = updateOnboardingInputSchema.parse(req.body);
    const body: OnboardingResponse = await onboarding.update(getAuth(req).userId, input);
    res.json(body);
  });

  // Signs out every other session; this one carries on with a fresh cookie.
  router.post(
    '/account/password',
    requireAuth,
    requireRealAccount,
    limit.login,
    async (req, res) => {
      const { userId } = getAuth(req);
      const passwordVersion = await accounts.changePassword(
        userId,
        changePasswordInputSchema.parse(req.body),
      );
      setSessionCookie(res, userId, env, passwordVersion);
      res.status(204).end();
    },
  );

  router.post('/account/delete', requireAuth, requireRealAccount, limit.login, async (req, res) => {
    const { password } = deleteAccountInputSchema.parse(req.body);
    await accounts.deleteAccount(getAuth(req).userId, password);
    clearSessionCookie(res, env);
    res.status(204).end();
  });

  router.get(
    '/workspaces/:workspaceId/preferences',
    requireAuth,
    requireWorkspaceRole('VIEWER'),
    async (req, res) => {
      const workspace = await prisma.workspace.findUnique({
        where: { id: getMembership(req).workspaceId },
        select: { preferences: true },
      });
      const body: WorkspacePreferences = readWorkspacePreferences(workspace?.preferences);
      res.json(body);
    },
  );

  router.put(
    '/workspaces/:workspaceId/preferences',
    requireAuth,
    requireRealAccount,
    requireWorkspaceRole('OWNER'),
    async (req, res) => {
      const body: WorkspacePreferences = workspacePreferencesSchema.parse(req.body);
      await prisma.workspace.update({
        where: { id: getMembership(req).workspaceId },
        data: { preferences: body },
      });
      res.json(body);
    },
  );

  return router;
}
