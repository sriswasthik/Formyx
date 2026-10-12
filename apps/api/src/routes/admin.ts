import {
  adminSearchQuerySchema,
  extendTrialInputSchema,
  grantComplimentaryInputSchema,
  type AdminWorkspace,
  type AdminWorkspacesResponse,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { createAdminService } from '../billing/admin-service.js';
import { routeParam } from '../lib/route-param.js';
import { getAuth } from '../middleware/auth.js';
import type { Guards } from './index.js';

/** /api/admin: Formyx's own admins only. Nobody becomes one through the API. */
export function createAdminRouter(
  { prisma }: AppDependencies,
  { requireAuth, requireAdmin }: Guards,
): Router {
  const router = Router();
  const admin = createAdminService(prisma);
  router.use('/admin', requireAuth, requireAdmin);

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
