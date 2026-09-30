import { hasRole, ROLE_LABELS, type Role } from '@formyx/shared';
import type { Request, RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
import { readSessionToken, verifySessionToken } from '../lib/session.js';

export interface AuthContext {
  userId: string;
}

export interface MembershipContext {
  workspaceId: string;
  role: Role;
}

function unauthorized(): AppError {
  return new AppError(401, 'UNAUTHORIZED', 'Log in to continue');
}

/** The signed-in user. Only call it in handlers that run after `requireAuth`. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/** The caller's membership. Only call it in handlers that run after `requireWorkspaceRole`. */
export function getMembership(req: Request): MembershipContext {
  if (!req.membership) throw new AppError(403, 'FORBIDDEN', 'You do not have access to this');
  return req.membership;
}

export interface AuthGuards {
  /** Rejects requests without a valid session cookie. Does not touch the database. */
  requireAuth: RequestHandler;
  /**
   * Checks the signed-in user's role in the `:workspaceId` route param. Non-members get 404,
   * so the response never confirms that a workspace exists; members without enough access
   * get 403. Must run after `requireAuth`.
   */
  requireWorkspaceRole: (minRole: Role) => RequestHandler;
}

export function createAuthGuards({
  env,
  prisma,
}: {
  env: Pick<Env, 'JWT_SECRET'>;
  prisma: Database;
}): AuthGuards {
  const requireAuth: RequestHandler = (req, _res, next) => {
    const token = readSessionToken(req);
    const userId = token ? verifySessionToken(token, env.JWT_SECRET) : null;
    if (!userId) {
      next(unauthorized());
      return;
    }
    req.auth = { userId };
    next();
  };

  const requireWorkspaceRole = (minRole: Role): RequestHandler => {
    return async (req, _res, next) => {
      const { userId } = getAuth(req);
      const { workspaceId } = req.params;
      if (typeof workspaceId !== 'string' || workspaceId === '') {
        throw new Error('requireWorkspaceRole used on a route without a :workspaceId param');
      }

      const membership = await prisma.membership.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        select: { role: true },
      });
      if (!membership) {
        throw new AppError(404, 'NOT_FOUND', 'Workspace not found');
      }
      if (!hasRole(membership.role, minRole)) {
        throw new AppError(
          403,
          'FORBIDDEN',
          `You need ${ROLE_LABELS[minRole].toLowerCase()} access to do this`,
        );
      }

      req.membership = { workspaceId, role: membership.role };
      next();
    };
  };

  return { requireAuth, requireWorkspaceRole };
}
