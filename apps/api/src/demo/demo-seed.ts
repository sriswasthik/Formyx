import type { Database } from '../lib/prisma.js';
import { isUniqueViolation, workspaceSlug } from '../services/auth-service.js';
import { formSlug } from '../services/form-service.js';
import { buildDemoContent } from './demo-content.js';

export const DEMO_EMAIL = 'demo@formyx.example';
export const DEMO_USER_NAME = 'Demo account';
export const DEMO_WORKSPACE_NAME = 'Formyx demo';
/** Not a bcrypt hash, so no password matches it; log-in also refuses demo accounts outright. */
const NO_PASSWORD = '!demo-account-has-no-password';

/** Resetting writes a few hundred rows; give the transaction more than the default 5 seconds. */
const TRANSACTION_TIMEOUT_MS = 30_000;

type Transaction = Parameters<Parameters<Database['$transaction']>[0]>[0];

export interface DemoAccount {
  userId: string;
  workspaceId: string;
}

async function findOrCreateAccount(tx: Transaction): Promise<DemoAccount> {
  const existing = await tx.user.findFirst({
    where: { isDemo: true },
    select: {
      id: true,
      memberships: { orderBy: { createdAt: 'asc' }, select: { workspaceId: true } },
    },
  });
  if (!existing) {
    const user = await tx.user.create({
      data: {
        name: DEMO_USER_NAME,
        email: DEMO_EMAIL,
        passwordHash: NO_PASSWORD,
        isDemo: true,
        memberships: {
          create: {
            role: 'OWNER',
            workspace: {
              create: { name: DEMO_WORKSPACE_NAME, slug: workspaceSlug(DEMO_WORKSPACE_NAME) },
            },
          },
        },
      },
      select: { id: true, memberships: { select: { workspaceId: true } } },
    });
    const workspaceId = user.memberships[0]?.workspaceId;
    if (!workspaceId) throw new Error('The demo workspace was not created');
    return { userId: user.id, workspaceId };
  }

  const userId = existing.id;
  const kept = existing.memberships[0]?.workspaceId;
  const workspaceId =
    kept ??
    (
      await tx.workspace.create({
        data: {
          name: DEMO_WORKSPACE_NAME,
          slug: workspaceSlug(DEMO_WORKSPACE_NAME),
          memberships: { create: { userId, role: 'OWNER' } },
        },
        select: { id: true },
      })
    ).id;

  // The demo account belongs to its own workspace only, alone and as its owner.
  await tx.membership.deleteMany({
    where: {
      OR: [
        { userId, workspaceId: { not: workspaceId } },
        { workspaceId, userId: { not: userId } },
      ],
    },
  });
  await tx.membership.update({
    where: { userId_workspaceId: { userId, workspaceId } },
    data: { role: 'OWNER' },
  });
  await tx.user.update({ where: { id: userId }, data: { name: DEMO_USER_NAME } });
  await tx.workspace.update({ where: { id: workspaceId }, data: { name: DEMO_WORKSPACE_NAME } });
  return { userId, workspaceId };
}

/**
 * Puts the demo account back to its starting point: its own workspace holding three forms with
 * a month of responses ending now. The user and workspace keep their ids, so visitors who are
 * signed in stay signed in. Everything happens in one transaction, so visitors never see a
 * half-built demo.
 */
export async function resetDemo(prisma: Database, now = new Date()): Promise<DemoAccount> {
  const content = buildDemoContent(now);

  return prisma.$transaction(
    async (tx) => {
      const account = await findOrCreateAccount(tx);
      const { userId, workspaceId } = account;

      // Responses, views, webhooks and subscriptions go with their forms.
      await tx.form.deleteMany({ where: { workspaceId } });
      await tx.invite.deleteMany({ where: { workspaceId } });

      for (const form of content) {
        const { id: formId } = await tx.form.create({
          data: {
            workspaceId,
            createdById: userId,
            title: form.title,
            slug: formSlug(form.title),
            status: 'PUBLISHED',
            draftSchema: form.schema,
            publishedSchema: form.schema,
            publishedTitle: form.title,
            theme: form.theme,
            publishedTheme: form.theme,
            publishedAt: form.publishedAt,
            createdAt: form.createdAt,
            updatedAt: form.publishedAt,
          },
          select: { id: true },
        });
        await tx.submission.createMany({
          data: form.submissions.map((submission) => ({ formId, ...submission })),
        });
        await tx.formView.createMany({
          data: form.views.map((createdAt) => ({ formId, createdAt })),
        });
      }
      return account;
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );
}

/**
 * The demo account's user id, setting the demo up first if it does not exist yet. Concurrent
 * first visits share one setup; another server racing this one loses on the unique email and
 * then finds what the winner made.
 */
export function createDemoAccounts(prisma: Database) {
  let settingUp: Promise<DemoAccount> | null = null;

  async function find(): Promise<string | null> {
    const user = await prisma.user.findFirst({ where: { isDemo: true }, select: { id: true } });
    return user?.id ?? null;
  }

  return {
    async userId(): Promise<string> {
      const existing = await find();
      if (existing) return existing;

      settingUp ??= resetDemo(prisma).finally(() => {
        settingUp = null;
      });
      try {
        return (await settingUp).userId;
      } catch (error) {
        const created = isUniqueViolation(error) ? await find() : null;
        if (created) return created;
        throw error;
      }
    },
  };
}
