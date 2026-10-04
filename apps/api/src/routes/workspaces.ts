import {
  createInviteInputSchema,
  updateMemberInputSchema,
  workspaceInputSchema,
  type Entitlements,
  type InvitePreview,
  type InvitesResponse,
  type Member,
  type MembersResponse,
  type SentInvite,
  type WorkspaceSummary,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { routeParam } from '../lib/route-param.js';
import { assertRole, getAuth, getMembership, type AuthGuards } from '../middleware/auth.js';
import { createInviteLinkRateLimiter, createInviteRateLimiter } from '../middleware/rate-limit.js';
import { createEntitlementService } from '../services/entitlement-service.js';
import { createInviteService } from '../services/invite-service.js';
import { createWorkspaceService } from '../services/workspace-service.js';

/**
 * Workspaces, their members and invites. Members of any role see who else is in the
 * workspace; renaming, deleting and managing people take OWNER. Anyone may leave.
 */
export function createWorkspacesRouter(
  { prisma, env, logger, mailer }: AppDependencies,
  { requireAuth, requireRealAccount, requireWorkspaceRole }: AuthGuards,
): Router {
  const router = Router();
  const workspaces = createWorkspaceService(prisma);
  const entitlements = createEntitlementService(prisma, env.ENTITLEMENTS_MODE);
  const invites = createInviteService({ prisma, mailer, logger, appUrl: env.APP_URL });
  const limitInvites = createInviteRateLimiter(env);
  const limitInviteLinks = createInviteLinkRateLimiter();

  // Names and email addresses: keep them out of shared caches.
  router.use(['/workspaces', '/invites'], (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/workspaces', requireAuth, requireRealAccount, async (req, res) => {
    const { name } = workspaceInputSchema.parse(req.body);
    const body: WorkspaceSummary = await workspaces.create(getAuth(req).userId, name);
    res.status(201).json(body);
  });

  router.patch(
    '/workspaces/:workspaceId',
    requireAuth,
    requireRealAccount,
    requireWorkspaceRole('OWNER'),
    async (req, res) => {
      const { name } = workspaceInputSchema.parse(req.body);
      const { workspaceId, role } = getMembership(req);
      const body: WorkspaceSummary = await workspaces.rename(workspaceId, name, role);
      res.json(body);
    },
  );

  router.delete(
    '/workspaces/:workspaceId',
    requireAuth,
    requireRealAccount,
    requireWorkspaceRole('OWNER'),
    async (req, res) => {
      await workspaces.remove(getMembership(req).workspaceId);
      res.status(204).end();
    },
  );

  // What the workspace's plan includes, for every member: editors see what they can publish.
  router.get(
    '/workspaces/:workspaceId/entitlements',
    requireAuth,
    requireWorkspaceRole('VIEWER'),
    async (req, res) => {
      const body: Entitlements = await entitlements.forWorkspace(getMembership(req).workspaceId);
      res.json(body);
    },
  );

  router.get(
    '/workspaces/:workspaceId/members',
    requireAuth,
    requireWorkspaceRole('VIEWER'),
    async (req, res) => {
      const body: MembersResponse = {
        members: await workspaces.members(getMembership(req).workspaceId),
      };
      res.json(body);
    },
  );

  router.patch(
    '/workspaces/:workspaceId/members/:userId',
    requireAuth,
    requireRealAccount,
    requireWorkspaceRole('OWNER'),
    async (req, res) => {
      const { role } = updateMemberInputSchema.parse(req.body);
      const body: Member = await workspaces.changeRole(
        getMembership(req).workspaceId,
        routeParam(req, 'userId'),
        role,
      );
      res.json(body);
    },
  );

  router.delete(
    '/workspaces/:workspaceId/members/:userId',
    requireAuth,
    requireRealAccount,
    requireWorkspaceRole('VIEWER'),
    async (req, res) => {
      const { workspaceId, role } = getMembership(req);
      const userId = routeParam(req, 'userId');
      // Leaving is always allowed; removing someone else takes OWNER.
      if (userId !== getAuth(req).userId) assertRole(role, 'OWNER');
      await workspaces.removeMember(workspaceId, userId);
      res.status(204).end();
    },
  );

  router.get(
    '/workspaces/:workspaceId/invites',
    requireAuth,
    requireWorkspaceRole('OWNER'),
    async (req, res) => {
      const body: InvitesResponse = {
        invites: await invites.list(getMembership(req).workspaceId),
      };
      res.json(body);
    },
  );

  router.post(
    '/workspaces/:workspaceId/invites',
    requireAuth,
    requireRealAccount,
    requireWorkspaceRole('OWNER'),
    limitInvites,
    async (req, res) => {
      const input = createInviteInputSchema.parse(req.body);
      const body: SentInvite = await invites.send(
        getMembership(req).workspaceId,
        getAuth(req).userId,
        input,
      );
      res.status(201).json(body);
    },
  );

  router.post(
    '/workspaces/:workspaceId/invites/:inviteId/resend',
    requireAuth,
    requireRealAccount,
    requireWorkspaceRole('OWNER'),
    limitInvites,
    async (req, res) => {
      const body: SentInvite = await invites.resend(
        getMembership(req).workspaceId,
        routeParam(req, 'inviteId'),
      );
      res.json(body);
    },
  );

  router.delete(
    '/workspaces/:workspaceId/invites/:inviteId',
    requireAuth,
    requireRealAccount,
    requireWorkspaceRole('OWNER'),
    async (req, res) => {
      await invites.revoke(getMembership(req).workspaceId, routeParam(req, 'inviteId'));
      res.status(204).end();
    },
  );

  // The link in the email. Opening it needs no account, so the page can say what it is for.
  router.get('/invites/:token', limitInviteLinks, async (req, res) => {
    const body: InvitePreview = await invites.preview(routeParam(req, 'token'));
    res.json(body);
  });

  router.post(
    '/invites/:token/accept',
    limitInviteLinks,
    requireAuth,
    requireRealAccount,
    async (req, res) => {
      const body: WorkspaceSummary = await invites.accept(
        routeParam(req, 'token'),
        getAuth(req).userId,
      );
      res.json(body);
    },
  );

  return router;
}
