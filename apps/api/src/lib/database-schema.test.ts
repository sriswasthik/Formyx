import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';

function createUser(email = 'ada@example.com') {
  return prisma.user.create({ data: { name: 'Ada', email, passwordHash: 'hash' } });
}

function createWorkspace(slug = 'ada-abc123') {
  return prisma.workspace.create({ data: { name: "Ada's workspace", slug } });
}

describe('database schema', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('keeps emails unique', async () => {
    await createUser();
    await expect(createUser()).rejects.toMatchObject({ code: 'P2002' });
  });

  it('keeps workspace slugs unique', async () => {
    await createWorkspace();
    await expect(createWorkspace()).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows one membership per user and workspace', async () => {
    const user = await createUser();
    const workspace = await createWorkspace();
    const data = { userId: user.id, workspaceId: workspace.id, role: 'OWNER' as const };

    await prisma.membership.create({ data });
    await expect(
      prisma.membership.create({ data: { ...data, role: 'VIEWER' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('removes memberships along with their user or workspace', async () => {
    const [ada, grace] = await Promise.all([createUser(), createUser('grace@example.com')]);
    const workspace = await createWorkspace();
    await prisma.membership.createMany({
      data: [
        { userId: ada.id, workspaceId: workspace.id, role: 'OWNER' },
        { userId: grace.id, workspaceId: workspace.id, role: 'EDITOR' },
      ],
    });

    await prisma.user.delete({ where: { id: grace.id } });
    expect(await prisma.membership.count()).toBe(1);

    await prisma.workspace.delete({ where: { id: workspace.id } });
    expect(await prisma.membership.count()).toBe(0);
    expect(await prisma.user.count()).toBe(1);
  });
});
