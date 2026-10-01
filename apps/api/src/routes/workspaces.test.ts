import {
  apiErrorSchema,
  createEmptyForm,
  meResponseSchema,
  membersResponseSchema,
  memberSchema,
  workspaceSummarySchema,
} from '@formyx/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createWorkspaceService } from '../services/workspace-service.js';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createPublishedForm } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

const app = createTestApp();
let team: Team;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

const as = (userId: string) => requestAs(app, userId);
const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;
const workspacePath = (suffix = '') => `/api/workspaces/${team.workspaceId}${suffix}`;

describe('POST /api/workspaces', () => {
  it('creates a workspace owned by the caller, listed with their others', async () => {
    const res = await as(team.users.VIEWER)
      .post('/api/workspaces', { name: '  Design team ' })
      .expect(201);
    const created = workspaceSummarySchema.parse(res.body);

    expect(created).toMatchObject({ name: 'Design team', role: 'OWNER' });
    expect(created.slug).toMatch(/^design-team-[a-z0-9]{6}$/);
    const me = meResponseSchema.parse((await as(team.users.VIEWER).get('/api/auth/me')).body);
    expect(me.workspaces.map(({ name, role }) => ({ name, role }))).toEqual([
      { name: 'Team', role: 'VIEWER' },
      { name: 'Design team', role: 'OWNER' },
    ]);
  });

  it('needs a name, and an account', async () => {
    const res = await as(team.users.OWNER).post('/api/workspaces', { name: ' ' }).expect(400);
    expect(apiErrorSchema.parse(res.body).error.details).toEqual([
      { path: 'name', message: 'Enter a name' },
    ]);
    await request(app).post('/api/workspaces').send({ name: 'X' }).expect(401);
  });
});

describe('PATCH and DELETE /api/workspaces/:workspaceId', () => {
  it('lets the owner rename it', async () => {
    const res = await as(team.users.OWNER).patch(workspacePath(), { name: 'Acme' }).expect(200);
    expect(workspaceSummarySchema.parse(res.body)).toMatchObject({ name: 'Acme', role: 'OWNER' });
  });

  it('deletes it with its forms, responses and memberships', async () => {
    await createPublishedForm(prisma, team.workspaceId, createEmptyForm());

    await as(team.users.OWNER).delete(workspacePath()).expect(204);

    expect(await prisma.workspace.count()).toBe(0);
    expect(await prisma.form.count()).toBe(0);
    expect(await prisma.membership.count()).toBe(0);
    // The people stay; only the workspace goes.
    expect(await prisma.user.count()).toBe(3);
  });
});

describe('members', () => {
  it('lists everyone with their role, for any member', async () => {
    const res = await as(team.users.VIEWER).get(workspacePath('/members')).expect(200);
    const { members } = membersResponseSchema.parse(res.body);

    expect(members.map(({ email, role }) => ({ email, role }))).toEqual([
      { email: 'owner@example.com', role: 'OWNER' },
      { email: 'editor@example.com', role: 'EDITOR' },
      { email: 'viewer@example.com', role: 'VIEWER' },
    ]);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('changes a role', async () => {
    const res = await as(team.users.OWNER)
      .patch(workspacePath(`/members/${team.users.VIEWER}`), { role: 'EDITOR' })
      .expect(200);
    expect(memberSchema.parse(res.body)).toMatchObject({
      userId: team.users.VIEWER,
      role: 'EDITOR',
    });
  });

  it('never leaves the workspace without an owner', async () => {
    const demote = await as(team.users.OWNER)
      .patch(workspacePath(`/members/${team.users.OWNER}`), { role: 'EDITOR' })
      .expect(409);
    expect(errorCode(demote.body)).toBe('LAST_OWNER');
    const leave = await as(team.users.OWNER)
      .delete(workspacePath(`/members/${team.users.OWNER}`))
      .expect(409);
    expect(errorCode(leave.body)).toBe('LAST_OWNER');

    // With a second owner, the first can step down.
    await as(team.users.OWNER)
      .patch(workspacePath(`/members/${team.users.EDITOR}`), { role: 'OWNER' })
      .expect(200);
    await as(team.users.OWNER)
      .patch(workspacePath(`/members/${team.users.OWNER}`), { role: 'VIEWER' })
      .expect(200);
  });

  it('keeps an owner when two owners demote each other at the same moment', async () => {
    const workspaces = createWorkspaceService(prisma);
    const pair = [team.users.OWNER, team.users.EDITOR];
    // Open connections first, so neither change waits for one while the other runs.
    await Promise.all(pair.map(() => prisma.$executeRaw`SELECT pg_sleep(0.05)`));

    for (let round = 0; round < 5; round++) {
      await prisma.membership.updateMany({
        where: { workspaceId: team.workspaceId, userId: { in: pair } },
        data: { role: 'OWNER' },
      });

      // Straight to the service, so both changes get past the role check before either runs.
      const results = await Promise.allSettled([
        workspaces.changeRole(team.workspaceId, team.users.EDITOR, 'VIEWER'),
        workspaces.changeRole(team.workspaceId, team.users.OWNER, 'VIEWER'),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
      const failure = results.find((result) => result.status === 'rejected');
      expect(failure?.reason).toMatchObject({ code: 'LAST_OWNER' });
      expect(
        await prisma.membership.count({ where: { workspaceId: team.workspaceId, role: 'OWNER' } }),
      ).toBe(1);
    }
  });

  it('removes a member, who then loses access', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, createEmptyForm());

    await as(team.users.OWNER)
      .delete(workspacePath(`/members/${team.users.EDITOR}`))
      .expect(204);

    await as(team.users.EDITOR).get(`/api/forms/${form.id}`).expect(403);
    await as(team.users.OWNER)
      .delete(workspacePath(`/members/${team.users.EDITOR}`))
      .expect(404);
  });

  it('lets anyone leave, but only owners remove others', async () => {
    await as(team.users.EDITOR)
      .delete(workspacePath(`/members/${team.users.VIEWER}`))
      .expect(403);

    await as(team.users.VIEWER)
      .delete(workspacePath(`/members/${team.users.VIEWER}`))
      .expect(204);

    const me = meResponseSchema.parse((await as(team.users.VIEWER).get('/api/auth/me')).body);
    expect(me.workspaces).toEqual([]);
  });
});
