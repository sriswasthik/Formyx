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

  it('puts new workspaces on the free plan', async () => {
    expect(await createWorkspace()).toMatchObject({
      plan: 'FREE',
      planStatus: 'ACTIVE',
      trialEndsAt: null,
    });
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

  describe('forms', () => {
    function createForm(workspaceId: string, slug: string, createdById?: string) {
      return prisma.form.create({
        data: { workspaceId, createdById, title: 'Survey', slug, draftSchema: {}, theme: {} },
      });
    }

    it('starts as a version 1 draft with a unique slug', async () => {
      const workspace = await createWorkspace();
      const form = await createForm(workspace.id, 'survey-abc12345');

      expect(form).toMatchObject({ status: 'DRAFT', version: 1, publishedSchema: null });
      await expect(createForm(workspace.id, 'survey-abc12345')).rejects.toMatchObject({
        code: 'P2002',
      });
    });

    it('keeps forms when their creator is deleted', async () => {
      const [user, workspace] = await Promise.all([createUser(), createWorkspace()]);
      const form = await createForm(workspace.id, 'survey-abc12345', user.id);

      await prisma.user.delete({ where: { id: user.id } });

      const kept = await prisma.form.findUniqueOrThrow({ where: { id: form.id } });
      expect(kept.createdById).toBeNull();
    });

    it('removes submissions with their form, and forms with their workspace', async () => {
      const workspace = await createWorkspace();
      const [first, second] = await Promise.all([
        createForm(workspace.id, 'first-abc12345'),
        createForm(workspace.id, 'second-abc12345'),
      ]);
      await prisma.submission.create({ data: { formId: first.id, answers: {}, metadata: {} } });

      await prisma.form.delete({ where: { id: first.id } });
      expect(await prisma.submission.count()).toBe(0);

      await prisma.workspace.delete({ where: { id: workspace.id } });
      expect(await prisma.form.findUnique({ where: { id: second.id } })).toBeNull();
    });
  });
});
