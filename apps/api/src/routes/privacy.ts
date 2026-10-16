import {
  requestAccountDeletionInputSchema,
  respondentLookupInputSchema,
  restoreAccountInputSchema,
  type AccountDeletion,
  type DataExport,
  type DataExports,
  type RespondentDeleteResponse,
  type RespondentLookupResponse,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { createBillingService } from '../billing/billing-service.js';
import { createRazorpayClient } from '../billing/razorpay.js';
import { AppError } from '../lib/app-error.js';
import { createPasswordHasher } from '../lib/password.js';
import { routeParam } from '../lib/route-param.js';
import { clearSessionCookie } from '../lib/session.js';
import { getAuth, getMembership } from '../middleware/auth.js';
import { createAuthRateLimiters, createRestoreLinkRateLimiter } from '../middleware/rate-limit.js';
import { createAccountDeletionService } from '../privacy/account-deletion.js';
import { createDataExportService } from '../privacy/data-export.js';
import { createRespondentDataService } from '../privacy/respondent-data.js';
import { createAccountService } from '../services/account-service.js';
import type { Guards } from './index.js';

/**
 * Data rights: someone's copy of their data, deleting their account (a week later, with an
 * undo), and a workspace's editors handling a respondent's request about theirs.
 */
export function createPrivacyRouter(
  { env, prisma, logger, mailer, jobs, storage, events }: AppDependencies,
  { requireAuth, requireRealAccount, requireWorkspaceRole }: Guards,
): Router {
  const router = Router();
  const accounts = createAccountService({
    prisma,
    passwords: createPasswordHasher(env.BCRYPT_COST),
  });
  const billing = createBillingService({ prisma, env, razorpay: createRazorpayClient(env) });
  const deletion = createAccountDeletionService({
    prisma,
    billing,
    mailer,
    logger,
    appUrl: env.APP_URL,
  });
  const exports = createDataExportService({ prisma, jobs });
  const respondents = createRespondentDataService({ prisma, storage, events });
  // The same limits as logging in: deleting takes the current password.
  const limit = createAuthRateLimiters(env);
  const limitRestoreLinks = createRestoreLinkRateLimiter();

  router.get('/account/deletion', requireAuth, async (req, res) => {
    const body: AccountDeletion = await deletion.describe(getAuth(req).userId);
    res.json(body);
  });

  router.post('/account/delete', requireAuth, requireRealAccount, limit.login, async (req, res) => {
    const { workspaces, ...confirmation } = requestAccountDeletionInputSchema.parse(req.body);
    const { userId } = getAuth(req);
    await accounts.confirm(userId, confirmation);
    const scheduledFor = await deletion.schedule(userId, workspaces);
    // Every session ended with it; this one too.
    clearSessionCookie(res, env);
    res.status(202).json({ scheduledFor: scheduledFor.toISOString() });
  });

  router.post('/account/restore', requireAuth, async (req, res) => {
    await deletion.restore(getAuth(req).userId);
    res.status(204).end();
  });

  router.post('/public/account/restore', limitRestoreLinks, async (req, res) => {
    const { token } = restoreAccountInputSchema.parse(req.body);
    if (!(await deletion.restoreByToken(token))) {
      throw new AppError(404, 'NOT_FOUND', 'This link no longer keeps an account.');
    }
    res.status(204).end();
  });

  router.get('/account/exports', requireAuth, async (req, res) => {
    const body: DataExports = { exports: await exports.list(getAuth(req).userId) };
    res.json(body);
  });

  router.post('/account/exports', requireAuth, requireRealAccount, async (req, res) => {
    const body: DataExport = await exports.request(getAuth(req).userId);
    res.status(202).json(body);
  });

  router.get('/account/exports/:exportId/download', requireAuth, async (req, res) => {
    const { archive, createdAt } = await exports.download(
      getAuth(req).userId,
      routeParam(req, 'exportId'),
    );
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="formyx-data-${createdAt.toISOString().slice(0, 10)}.zip"`,
      'Cache-Control': 'no-store',
    });
    res.send(archive);
  });

  router.get(
    '/workspaces/:workspaceId/respondent-data',
    requireAuth,
    requireWorkspaceRole('EDITOR'),
    async (req, res) => {
      const { email } = respondentLookupInputSchema.parse(req.query);
      const body: RespondentLookupResponse = await respondents.lookup(
        getMembership(req).workspaceId,
        getAuth(req).userId,
        email,
      );
      res.set('Cache-Control', 'no-store');
      res.json(body);
    },
  );

  router.post(
    '/workspaces/:workspaceId/respondent-data/delete',
    requireAuth,
    requireRealAccount,
    requireWorkspaceRole('EDITOR'),
    async (req, res) => {
      const { email } = respondentLookupInputSchema.parse(req.body);
      const body: RespondentDeleteResponse = {
        deleted: await respondents.remove(
          getMembership(req).workspaceId,
          getAuth(req).userId,
          email,
        ),
      };
      res.json(body);
    },
  );

  return router;
}
