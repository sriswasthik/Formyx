import {
  adminDataRequestSchema,
  adminFormActionInputSchema,
  adminSearchQuerySchema,
  adminSuspendUserInputSchema,
  extendTrialInputSchema,
  grantComplimentaryInputSchema,
  type AdminDataRequests,
  type AdminFormReview,
  type AdminReviewQueue,
  type AdminWorkspace,
  type AdminWorkspacesResponse,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { createAdminService } from '../billing/admin-service.js';
import { routeParam } from '../lib/route-param.js';
import { getAuth } from '../middleware/auth.js';
import { createReviewService } from '../trust/review-service.js';
import type { Guards } from './index.js';

/** /api/admin: Formyx's own admins only. Nobody becomes one through the API. */
export function createAdminRouter(
  { prisma }: AppDependencies,
  { requireAuth, requireAdmin }: Guards,
): Router {
  const router = Router();
  const admin = createAdminService(prisma);
  const review = createReviewService(prisma);
  router.use('/admin', requireAuth, requireAdmin);

  // Trust and safety: held and reported forms, and suspending accounts.
  router.get('/admin/review', async (_req, res) => {
    const body: AdminReviewQueue = { items: await review.queue() };
    res.json(body);
  });

  router.get('/admin/review/:formId', async (req, res) => {
    const body: AdminFormReview = await review.get(routeParam(req, 'formId'));
    res.json(body);
  });

  router.post('/admin/review/:formId', async (req, res) => {
    const { action, note } = adminFormActionInputSchema.parse(req.body);
    const body: AdminFormReview = await review.act(
      getAuth(req).userId,
      routeParam(req, 'formId'),
      action,
      note,
    );
    res.json(body);
  });

  // Requests about personal data: exports, account deletions, respondents' requests.
  router.get('/admin/data-requests', async (_req, res) => {
    const rows = await prisma.dataRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        kind: true,
        status: true,
        workspaceId: true,
        details: true,
        createdAt: true,
        completedAt: true,
        user: { select: { id: true, email: true } },
      },
    });
    const body: AdminDataRequests = {
      requests: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        requester: row.user,
        workspaceId: row.workspaceId,
        details: adminDataRequestSchema.shape.details.catch({}).parse(row.details),
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
      })),
    };
    res.json(body);
  });

  router.post('/admin/users/:userId/suspension', async (req, res) => {
    const { suspended, note } = adminSuspendUserInputSchema.parse(req.body);
    await review.setUserSuspended(getAuth(req).userId, routeParam(req, 'userId'), suspended, note);
    res.status(204).end();
  });

  router.get('/admin/workspaces', async (req, res) => {
    const { query } = adminSearchQuerySchema.parse(req.query);
    const body: AdminWorkspacesResponse = { workspaces: await admin.search(query) };
    res.json(body);
  });

  router.get('/admin/workspaces/:workspaceId', async (req, res) => {
    const body: AdminWorkspace = await admin.get(routeParam(req, 'workspaceId'));
    res.json(body);
  });

  router.post('/admin/workspaces/:workspaceId/complimentary', async (req, res) => {
    const input = grantComplimentaryInputSchema.parse(req.body);
    const body: AdminWorkspace = await admin.grantComplimentary(
      getAuth(req).userId,
      routeParam(req, 'workspaceId'),
      input,
    );
    res.json(body);
  });

  router.delete('/admin/workspaces/:workspaceId/complimentary', async (req, res) => {
    const body: AdminWorkspace = await admin.endComplimentary(
      getAuth(req).userId,
      routeParam(req, 'workspaceId'),
    );
    res.json(body);
  });

  router.post('/admin/workspaces/:workspaceId/extend-trial', async (req, res) => {
    const input = extendTrialInputSchema.parse(req.body);
    const body: AdminWorkspace = await admin.extendTrial(
      getAuth(req).userId,
      routeParam(req, 'workspaceId'),
      input,
    );
    res.json(body);
  });

  return router;
}
