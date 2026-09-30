import { ROLES, type Role } from '@formyx/shared';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE, signSessionToken } from '../lib/session.js';
import { TEST_JWT_SECRET } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createAuthGuards, getAuth, getMembership } from './auth.js';
import { errorHandler } from './error-handler.js';

const { requireAuth, requireWorkspaceRole } = createAuthGuards({
  env: { JWT_SECRET: TEST_JWT_SECRET },
  prisma,
});

const app = express();
app.use(cookieParser());
app.get('/whoami', requireAuth, (req, res) => {
  res.json(getAuth(req));
});
for (const minRole of ROLES) {
  app.get(
    `/workspaces/:workspaceId/${minRole}`,
    requireAuth,
    requireWorkspaceRole(minRole),
    (req, res) => {
      res.json(getMembership(req));
    },
  );
}
app.use(errorHandler);

function cookieFor(userId: string): string {
  return `${SESSION_COOKIE}=${signSessionToken(userId, TEST_JWT_SECRET)}`;
}

describe('requireAuth', () => {
  it('exposes the signed-in user id to later handlers', async () => {
    const res = await request(app).get('/whoami').set('Cookie', cookieFor('user-1')).expect(200);
    expect(res.body).toEqual({ userId: 'user-1' });
  });

  it('rejects a missing or invalid session', async () => {
    await request(app).get('/whoami').expect(401);
    await request(app).get('/whoami').set('Cookie', `${SESSION_COOKIE}=garbage`).expect(401);
  });
});

describe('requireWorkspaceRole', () => {
  const userIds = {} as Record<Role | 'OUTSIDER', string>;
  let workspaceId = '';

  beforeEach(async () => {
    await resetDatabase();
    const workspace = await prisma.workspace.create({ data: { name: 'Team', slug: 'team' } });
    workspaceId = workspace.id;

    for (const kind of ['OWNER', 'EDITOR', 'VIEWER', 'OUTSIDER'] as const) {
      const user = await prisma.user.create({
        data: { name: kind, email: `${kind.toLowerCase()}@example.com`, passwordHash: 'x' },
      });
      userIds[kind] = user.id;
      if (kind !== 'OUTSIDER') {
        await prisma.membership.create({ data: { userId: user.id, workspaceId, role: kind } });
      }
    }
  });

  function visit(user: Role | 'OUTSIDER', minRole: Role, id = workspaceId) {
    return request(app).get(`/workspaces/${id}/${minRole}`).set('Cookie', cookieFor(userIds[user]));
  }

  it.each<[Role, Role, number]>([
    ['OWNER', 'OWNER', 200],
    ['OWNER', 'EDITOR', 200],
    ['OWNER', 'VIEWER', 200],
    ['EDITOR', 'OWNER', 403],
    ['EDITOR', 'EDITOR', 200],
    ['EDITOR', 'VIEWER', 200],
    ['VIEWER', 'OWNER', 403],
    ['VIEWER', 'EDITOR', 403],
    ['VIEWER', 'VIEWER', 200],
  ])('%s needing %s gets %i', async (role, minRole, status) => {
    await visit(role, minRole).expect(status);
  });

  it('exposes the membership to later handlers', async () => {
    const res = await visit('EDITOR', 'VIEWER').expect(200);
    expect(res.body).toEqual({ workspaceId, role: 'EDITOR' });
  });

  it('explains which access is missing', async () => {
    const res = await visit('VIEWER', 'EDITOR').expect(403);
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'You need editor access to do this' },
    });
  });

  it('answers non-members as if the workspace did not exist', async () => {
    const outsider = await visit('OUTSIDER', 'VIEWER').expect(404);
    const missing = await visit('OWNER', 'VIEWER', 'no-such-workspace').expect(404);

    expect(outsider.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Workspace not found' },
    });
    expect(missing.body).toEqual(outsider.body);
  });

  it('requires a session', async () => {
    await request(app).get(`/workspaces/${workspaceId}/VIEWER`).expect(401);
  });
});
