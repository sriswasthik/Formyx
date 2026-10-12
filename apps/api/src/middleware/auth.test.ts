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

const { requireAuth, requireWorkspaceRole, requireFormRole } = createAuthGuards({
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
  app.get(`/forms/:formId/${minRole}`, requireAuth, requireFormRole(minRole), (req, res) => {
    res.json(getMembership(req));
  });
}
app.use(errorHandler);

function cookieFor(userId: string): string {
  return `${SESSION_COOKIE}=${signSessionToken(userId, TEST_JWT_SECRET)}`;
}

describe('requireAuth', () => {
  it('exposes the signed-in user id to later handlers', async () => {
    const res = await request(app)
      .get('/whoami')
      .set('Cookie', cookieFor(userIds.OWNER))
      .expect(200);
    expect(res.body).toEqual({ userId: userIds.OWNER });
  });

  it('signs out sessions of deleted accounts, and from before a password change', async () => {
    await request(app).get('/whoami').set('Cookie', cookieFor('no-such-user')).expect(401);

    const before = cookieFor(userIds.OWNER);
    await prisma.user.update({ where: { id: userIds.OWNER }, data: { passwordVersion: 1 } });
    const res = await request(app).get('/whoami').set('Cookie', before).expect(401);
    expect(String(res.headers['set-cookie'])).toMatch(/^formyx_session=;/);
    await request(app)
      .get('/whoami')
      .set('Cookie', `${SESSION_COOKIE}=${signSessionToken(userIds.OWNER, TEST_JWT_SECRET, 1)}`)
      .expect(200);
  });

  it('rejects a missing or invalid session', async () => {
    await request(app).get('/whoami').expect(401);
    await request(app).get('/whoami').set('Cookie', `${SESSION_COOKIE}=garbage`).expect(401);
  });
});

type Person = Role | 'OUTSIDER';

const userIds = {} as Record<Person, string>;
let workspaceId = '';
let formId = '';

beforeEach(async () => {
  await resetDatabase();
  const workspace = await prisma.workspace.create({ data: { name: 'Team', slug: 'team' } });
  workspaceId = workspace.id;
  const form = await prisma.form.create({
    data: { workspaceId, title: 'Survey', slug: 'survey-abc', draftSchema: {}, theme: {} },
  });
  formId = form.id;

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

const ACCESS_TABLE: [Role, Role, number][] = [
  ['OWNER', 'OWNER', 200],
  ['OWNER', 'EDITOR', 200],
  ['OWNER', 'VIEWER', 200],
  ['EDITOR', 'OWNER', 403],
  ['EDITOR', 'EDITOR', 200],
  ['EDITOR', 'VIEWER', 200],
  ['VIEWER', 'OWNER', 403],
  ['VIEWER', 'EDITOR', 403],
  ['VIEWER', 'VIEWER', 200],
];

const NOT_A_MEMBER = {
  error: { code: 'FORBIDDEN', message: 'You are not a member of this workspace' },
};

describe.each([
  ['requireWorkspaceRole', 'workspaces', () => workspaceId],
  ['requireFormRole', 'forms', () => formId],
] as const)('%s', (_name, resource, resourceId) => {
  function visit(person: Person, minRole: Role, id = resourceId()) {
    return request(app)
      .get(`/${resource}/${id}/${minRole}`)
      .set('Cookie', cookieFor(userIds[person]));
  }

  it.each(ACCESS_TABLE)('%s needing %s gets %i', async (role, minRole, status) => {
    await visit(role, minRole).expect(status);
  });

  it("exposes the caller's membership of the workspace to later handlers", async () => {
    const res = await visit('EDITOR', 'VIEWER').expect(200);
    expect(res.body).toEqual({ workspaceId, role: 'EDITOR' });
  });

  it('explains which access is missing', async () => {
    const res = await visit('VIEWER', 'EDITOR').expect(403);
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'You need editor access to do this' },
    });
  });

  it('rejects non-members with 403', async () => {
    const res = await visit('OUTSIDER', 'VIEWER').expect(403);
    expect(res.body).toEqual(NOT_A_MEMBER);
  });

  it('requires a session', async () => {
    await request(app).get(`/${resource}/${resourceId()}/VIEWER`).expect(401);
  });
});

describe('unknown resources', () => {
  it('answers an unknown workspace like one the caller is not a member of', async () => {
    const res = await request(app)
      .get('/workspaces/no-such-workspace/VIEWER')
      .set('Cookie', cookieFor(userIds.OWNER))
      .expect(403);
    expect(res.body).toEqual(NOT_A_MEMBER);
  });

  it('answers an unknown form with 404', async () => {
    const res = await request(app)
      .get('/forms/no-such-form/VIEWER')
      .set('Cookie', cookieFor(userIds.OWNER))
      .expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Form not found' } });
  });
});
