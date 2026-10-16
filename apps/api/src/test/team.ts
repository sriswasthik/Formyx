import type { Role } from '@formyx/shared';
import type { Express } from 'express';
import request from 'supertest';
import { SESSION_COOKIE, signSessionToken } from '../lib/session.js';
import type { Database } from '../lib/prisma.js';
import { TEST_JWT_SECRET } from './create-test-app.js';

export interface Team {
  workspaceId: string;
  /** User ids by their role in the workspace. */
  users: Record<Role, string>;
}

/** A workspace with an owner, an editor and a viewer. */
const ESTABLISHED_ACCOUNT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export async function createTeam(prisma: Database): Promise<Team> {
  const workspace = await prisma.workspace.create({ data: { name: 'Team', slug: 'team' } });
  const users = {} as Record<Role, string>;
  for (const role of ['OWNER', 'EDITOR', 'VIEWER'] as const) {
    const user = await prisma.user.create({
      data: {
        name: role,
        email: `${role.toLowerCase()}@example.com`,
        passwordHash: 'x',
        // Established accounts: new ones have limits (NEW_ACCOUNT_LIMITS) most tests aren't about.
        createdAt: new Date(Date.now() - ESTABLISHED_ACCOUNT_AGE_MS),
        // And confirmed, as accounts from before email verification count.
        emailVerifiedAt: new Date(Date.now() - ESTABLISHED_ACCOUNT_AGE_MS),
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, workspaceId: workspace.id, role },
    });
    users[role] = user.id;
  }
  return { workspaceId: workspace.id, users };
}

/** Supertest requests signed in as `userId`. */
export function requestAs(app: Express, userId: string) {
  const cookie = `${SESSION_COOKIE}=${signSessionToken(userId, TEST_JWT_SECRET)}`;
  return {
    get: (url: string) => request(app).get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => {
      const req = request(app).post(url).set('Cookie', cookie);
      return body ? req.send(body) : req;
    },
    patch: (url: string, body: object) => request(app).patch(url).set('Cookie', cookie).send(body),
    put: (url: string, body: object) => request(app).put(url).set('Cookie', cookie).send(body),
    delete: (url: string) => request(app).delete(url).set('Cookie', cookie),
  };
}
