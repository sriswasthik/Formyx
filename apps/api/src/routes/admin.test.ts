import {
  adminWorkspaceSchema,
  adminWorkspacesResponseSchema,
  meResponseSchema,
} from '@formyx/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

const app = createTestApp({ ENTITLEMENTS_MODE: 'enforced' });
const DAY_MS = 24 * 60 * 60 * 1000;

let team: Team;
let adminId: string;
let admin: ReturnType<typeof requestAs>;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
  adminId = (
    await prisma.user.create({
      data: { name: 'Admin', email: 'admin@formyx.app', passwordHash: 'x', isAdmin: true },
    })
  ).id;
  admin = requestAs(app, adminId);
});

const workspaceUrl = () => `/api/admin/workspaces/${team.workspaceId}`;

describe('who may', () => {
  it('lets admins in, and nobody else', async () => {
    await admin.get('/api/admin/workspaces').expect(200);
    for (const userId of Object.values(team.users)) {
      await requestAs(app, userId).get('/api/admin/workspaces').expect(403);
      await requestAs(app, userId).post(`${workspaceUrl()}/extend-trial`, { days: 30 }).expect(403);
    }
    await request(app).get('/api/admin/workspaces').expect(401);
  });

  it('tells the app who is an admin', async () => {
    const me = meResponseSchema.parse((await admin.get('/api/auth/me').expect(200)).body);
    expect(me.user.isAdmin).toBe(true);
    const owner = meResponseSchema.parse(
      (await requestAs(app, team.users.OWNER).get('/api/auth/me').expect(200)).body,
    );
    expect(owner.user.isAdmin).toBeUndefined();
  });
});

describe('search', () => {
  it('finds workspaces by name, slug or an owner’s email', async () => {
    await prisma.workspace.create({ data: { name: 'Acme 100%', slug: 'acme' } });
    const search = async (query: string) =>
      adminWorkspacesResponseSchema
        .parse(
          (await admin.get(`/api/admin/workspaces?query=${encodeURIComponent(query)}`).expect(200))
            .body,
        )
        .workspaces.map(({ name }) => name);

    expect(await search('owner@example')).toEqual(['Team']);
    expect(await search('ACME')).toEqual(['Acme 100%']);
    // % is a character, not a wildcard.
    expect(await search('%')).toEqual(['Acme 100%']);
    expect((await search('')).sort()).toEqual(['Acme 100%', 'Team']);
  });

  it('shows where a workspace’s billing stands', async () => {
    const found = adminWorkspaceSchema.parse((await admin.get(workspaceUrl()).expect(200)).body);
    expect(found).toMatchObject({
      name: 'Team',
      owners: [{ name: 'OWNER', email: 'owner@example.com' }],
      plan: 'FREE',
      effectivePlan: 'FREE',
      subscription: null,
      forms: 0,
    });
  });
});

describe('complimentary plans', () => {
  it('gives a plan for a number of days, recorded, and takes it away', async () => {
    const res = await admin.post(`${workspaceUrl()}/complimentary`, {
      plan: 'BUSINESS',
      days: 30,
      note: 'Beta tester',
    });
    const given = adminWorkspaceSchema.parse(res.body);
    expect(given).toMatchObject({
      plan: 'FREE',
      effectivePlan: 'BUSINESS',
      complimentaryPlan: 'BUSINESS',
    });
    const until = new Date(given.complimentaryUntil ?? 0).getTime();
    expect(Math.abs(until - (Date.now() + 30 * DAY_MS))).toBeLessThan(60_000);
    const action = await prisma.adminAction.findFirstOrThrow();
    expect(action).toMatchObject({
      adminId,
      workspaceId: team.workspaceId,
      action: 'grant_complimentary',
    });
    expect(action.details).toMatchObject({ plan: 'BUSINESS', note: 'Beta tester' });

    const ended = adminWorkspaceSchema.parse(
      (await admin.delete(`${workspaceUrl()}/complimentary`).expect(200)).body,
    );
    expect(ended).toMatchObject({ effectivePlan: 'FREE', complimentaryPlan: null });
  });

  it('checks what it is given', async () => {
    await admin.post(`${workspaceUrl()}/complimentary`, { plan: 'FREE', days: 30 }).expect(400);
    await admin.post(`${workspaceUrl()}/complimentary`, { plan: 'PRO', days: 400 }).expect(400);
    await admin
      .post('/api/admin/workspaces/nothere/complimentary', { plan: 'PRO', days: 3 })
      .expect(404);
  });
});

describe('trials', () => {
  it('adds days to a running trial', async () => {
    const endsAt = new Date(Date.now() + 5 * DAY_MS);
    await prisma.workspace.update({
      where: { id: team.workspaceId },
      data: { plan: 'PRO', planStatus: 'TRIALING', trialEndsAt: endsAt },
    });
    const res = await admin.post(`${workspaceUrl()}/extend-trial`, { days: 10 }).expect(200);
    expect(adminWorkspaceSchema.parse(res.body).trialEndsAt).toBe(
      new Date(endsAt.getTime() + 10 * DAY_MS).toISOString(),
    );
  });

  it('gives a trial again to a workspace on Free', async () => {
    await prisma.workspace.update({
      where: { id: team.workspaceId },
      data: { downgradedFrom: 'PRO', downgradedAt: new Date() },
    });
    const res = await admin.post(`${workspaceUrl()}/extend-trial`, { days: 14 }).expect(200);
    expect(adminWorkspaceSchema.parse(res.body)).toMatchObject({
      plan: 'PRO',
      effectivePlan: 'PRO',
      planStatus: 'TRIALING',
    });
    expect(
      (await prisma.workspace.findUniqueOrThrow({ where: { id: team.workspaceId } }))
        .downgradedFrom,
    ).toBeNull();
  });

  it('has no trial to extend for a workspace that pays', async () => {
    await prisma.workspace.update({
      where: { id: team.workspaceId },
      data: { plan: 'PRO', planStatus: 'ACTIVE' },
    });
    await admin.post(`${workspaceUrl()}/extend-trial`, { days: 14 }).expect(409);
  });
});
