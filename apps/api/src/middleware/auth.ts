import { hasRole, ROLE_LABELS, type Role } from '@formyx/shared';
import type { Request, RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import { demoRestricted, isDemoUser } from '../demo/restrictions.js';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
import { routeParam } from '../lib/route-param.js';
import { clearSessionCookie, readSessionToken, verifySession } from '../lib/session.js';

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
   * Refuses the shared demo account (403 DEMO_RESTRICTED), for actions that reach outside
   * Formyx or change the workspace and its members. Must run after `requireAuth`.
   */
  requireRealAccount: RequestHandler;
  /**
   * Checks the signed-in user's role in the `:workspaceId` route param: non-members and
   * members without enough access get 403. Must run after `requireAuth`.
   */
  requireWorkspaceRole: (minRole: Role) => RequestHandler;
  /**
   * Like `requireWorkspaceRole`, for the workspace that owns the `:formId` route param.
   * A form that does not exist gets 404. Must run after `requireAuth`.
   */
  requireFormRole: (minRole: Role) => RequestHandler;
  /** Formyx's own admins only (`isAdmin`, set from the command line). Must run after `requireAuth`. */
  requireAdmin: RequestHandler;
}

export interface FormAccess {
  workspaceId: string;
  /** The user's role in the form's workspace; `null` when they are not a member. */
  role: Role | null;
}

/** Who `userId` is to the form, in one query; `null` if the form does not exist. */
export async function findFormAccess(
  prisma: Database,
  formId: string,
  userId: string,
): Promise<FormAccess | null> {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: {
      workspaceId: true,
      workspace: { select: { memberships: { where: { userId }, select: { role: true } } } },
    },
  });
  if (!form) return null;
  return { workspaceId: form.workspaceId, role: form.workspace.memberships[0]?.role ?? null };
}

/** Throws unless `role` (`null` for non-members) grants at least `minRole`. */
export function assertRole(role: Role | null, minRole: Role): asserts role is Role {
  if (!role) {
    throw new AppError(403, 'FORBIDDEN', 'You are not a member of this workspace');
  }
  if (!hasRole(role, minRole)) {
    throw new AppError(
      403,
      'FORBIDDEN',
      `You need ${ROLE_LABELS[minRole].toLowerCase()} access to do this`,
    );
  }
}

export function createAuthGuards({
  env,
  prisma,
}: {
  /** `NODE_ENV` decides the cookie's flags when a stale one is cleared; production if absent. */
  env: Pick<Env, 'JWT_SECRET'> & Partial<Pick<Env, 'NODE_ENV'>>;
  prisma: Database;
}): AuthGuards {
  const cookieEnv = { JWT_SECRET: env.JWT_SECRET, NODE_ENV: env.NODE_ENV ?? 'production' };
  const requireAuth: RequestHandler = async (req, res, next) => {
    const token = readSessionToken(req);
    const session = token ? verifySession(token, env.JWT_SECRET) : null;
    // The account must still exist, at the password the session was signed with: changing
    // the password signs out every other session, and deleted accounts are signed out.
    const user =
      session &&
      (await prisma.user.findUnique({
        where: { id: session.userId },
        select: { passwordVersion: true },
      }));
    if (!session || user?.passwordVersion !== session.passwordVersion) {
      // A signed but stale session: drop the cookie, so the browser stops sending it.
      if (session) clearSessionCookie(res, cookieEnv);
      next(unauthorized());
      return;
    }
    req.auth = { userId: session.userId };
    next();
  };

  const requireRealAccount: RequestHandler = async (req, _res, next) => {
    if (await isDemoUser(prisma, getAuth(req).userId)) throw demoRestricted();
    next();
  };

  const requireWorkspaceRole = (minRole: Role): RequestHandler => {
    return async (req, _res, next) => {
      const { userId } = getAuth(req);
      const workspaceId = routeParam(req, 'workspaceId');

      const membership = await prisma.membership.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        select: { role: true },
      });
      const role = membership?.role ?? null;
      assertRole(role, minRole);

      req.membership = { workspaceId, role };
      next();
    };
  };

  const requireFormRole = (minRole: Role): RequestHandler => {
    return async (req, _res, next) => {
      const { userId } = getAuth(req);
      const formId = routeParam(req, 'formId');

      const access = await findFormAccess(prisma, formId, userId);
      if (!access) {
        throw new AppError(404, 'NOT_FOUND', 'Form not found');
      }
      const { workspaceId, role } = access;
      assertRole(role, minRole);

      req.membership = { workspaceId, role };
      next();
    };
  };

  const requireAdmin: RequestHandler = async (req, _res, next) => {
    const user = await prisma.user.findUnique({
      where: { id: getAuth(req).userId },
      select: { isAdmin: true },
    });
    if (!user?.isAdmin) throw new AppError(403, 'FORBIDDEN', 'You do not have access to this');
    next();
  };

  return { requireAuth, requireRealAccount, requireWorkspaceRole, requireFormRole, requireAdmin };
}
