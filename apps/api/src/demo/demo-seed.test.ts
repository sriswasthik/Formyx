import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import {
  createDemoAccounts,
  DEMO_EMAIL,
  DEMO_USER_NAME,
  DEMO_WORKSPACE_NAME,
  resetDemo,
} from './demo-seed.js';

beforeEach(async () => {
  await resetDatabase();
});

async function demoWorkspace(workspaceId: string) {
  return prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: {
      name: true,
      memberships: { select: { userId: true, role: true } },
      invites: { select: { id: true } },
      forms: {
        orderBy: { updatedAt: 'desc' },
        select: {
          title: true,
          status: true,
          _count: { select: { submissions: true, views: true } },
        },
      },
    },
  });
}

describe('resetDemo', () => {
  it('sets up the demo account with three live forms and a month of responses', async () => {
    const { userId, workspaceId } = await resetDemo(prisma);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ isDemo: true, email: DEMO_EMAIL, name: DEMO_USER_NAME });

    const workspace = await demoWorkspace(workspaceId);
    expect(workspace.name).toBe(DEMO_WORKSPACE_NAME);
    expect(workspace.memberships).toEqual([{ userId, role: 'OWNER' }]);
    expect(workspace.forms.map(({ title, status }) => [title, status])).toEqual([
      ['Product feedback', 'PUBLISHED'],
      ['Design Systems Day registration', 'PUBLISHED'],
      ['Product designer application', 'PUBLISHED'],
    ]);
    const responses = workspace.forms.reduce((sum, form) => sum + form._count.submissions, 0);
    expect(responses).toBe(150);
    for (const form of workspace.forms) {
      expect(form._count.views).toBeGreaterThan(form._count.submissions);
    }
  });

  it('undoes what visitors changed, keeping the same account and workspace', async () => {
    const first = await resetDemo(prisma);
    const { userId, workspaceId } = first;

    // A busy day of visitors.
    const stranger = await prisma.user.create({
      data: { name: 'Stranger', email: 'stranger@example.com', passwordHash: 'x' },
    });
    await prisma.membership.create({ data: { userId: stranger.id, workspaceId, role: 'EDITOR' } });
    await prisma.workspace.update({ where: { id: workspaceId }, data: { name: 'Hacked' } });
    await prisma.invite.create({
      data: {
        workspaceId,
        email: 'friend@example.com',
        role: 'VIEWER',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const forms = await prisma.form.findMany({ where: { workspaceId }, select: { id: true } });
    await prisma.submission.deleteMany({ where: { formId: forms[0]?.id } });
    await prisma.form.delete({ where: { id: forms[1]?.id } });

    expect(await resetDemo(prisma)).toEqual(first);

    const workspace = await demoWorkspace(workspaceId);
    expect(workspace.name).toBe(DEMO_WORKSPACE_NAME);
    expect(workspace.memberships).toEqual([{ userId, role: 'OWNER' }]);
    expect(workspace.invites).toEqual([]);
    expect(workspace.forms).toHaveLength(3);
    expect(await prisma.submission.count()).toBe(150);
    // The stranger keeps their account; only their place in the demo is gone.
    expect(await prisma.user.count({ where: { id: stranger.id } })).toBe(1);
  });
});

describe('createDemoAccounts', () => {
  it('sets the demo up once, however many visitors arrive at the same time', async () => {
    const accounts = createDemoAccounts(prisma);

    const ids = await Promise.all([accounts.userId(), accounts.userId(), accounts.userId()]);

    expect(new Set(ids).size).toBe(1);
    expect(await prisma.user.count({ where: { isDemo: true } })).toBe(1);
    expect(await prisma.form.count()).toBe(3);
    // Later visitors get the existing account rather than a fresh reset.
    await prisma.form.deleteMany({ where: { title: 'Product feedback' } });
    expect(await accounts.userId()).toBe(ids[0]);
    expect(await prisma.form.count()).toBe(2);
  });
});
