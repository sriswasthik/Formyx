import { createHash, randomBytes } from 'node:crypto';
import {
  ACCOUNT_DELETION_DAYS,
  accountDeletionPlanSchema,
  formatDateTime,
  type AccountDeletion,
  type AccountDeletionPlan,
  type OwnedWorkspace,
  type WorkspaceDeletionChoice,
} from '@formyx/shared';
import type { Logger } from 'pino';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import type { Mailer } from '../lib/mailer.js';
import type { Database } from '../lib/prisma.js';
import {
  button,
  COLOR,
  emailPage,
  escapeHtml,
  heading,
  paragraph as p,
  singleLine,
  type RenderedEmail,
} from '../notifications/email-layout.js';
import { handOver } from '../services/workspace-service.js';
import { completeDataRequest, logDataRequest } from './data-request-log.js';

/*
 * Deleting an account, a week after asking (see privacy/account-deletion.ts in shared). Until
 * then it can be undone, from the emailed link or by signing in. Then its shared workspaces
 * pass to the chosen members (their plans stop renewing, as the person paying is leaving),
 * the rest are deleted (their plans cancelled at once), what it made in workspaces that stay
 * passes to an owner, and the account goes, with its sign-in methods and personal data.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** What deletion needs from billing (see BillingService). */
export interface DeletionBilling {
  /** Cancels a workspace's plan at once, before it is deleted. Throws if it can't. */
  endForDeletion(workspaceId: string): Promise<void>;
  /** Stops the workspace's plan renewing, if `payerId` (who is leaving) pays for it. */
  stopRenewing(workspaceId: string, payerId: string): Promise<void>;
  /** Whether it pays for a plan right now. */
  hasRunningPlan(workspaceId: string): Promise<boolean>;
}

/** What is kept with the account while it waits: the choices, and the log's entry. */
const storedPlanSchema = accountDeletionPlanSchema.extend({ requestId: z.string().optional() });
type StoredPlan = z.infer<typeof storedPlanSchema>;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

type Transaction = Parameters<Parameters<Database['$transaction']>[0]>[0];

/** The workspaces `userId` owns, and what deleting the account would do to each. */
async function ownedWorkspaces(
  db: Database | Transaction,
  userId: string,
): Promise<(Omit<OwnedWorkspace, 'paidPlan'> & { owners: string[] })[]> {
  const owned = await db.membership.findMany({
    where: { userId, role: 'OWNER' },
    orderBy: { createdAt: 'asc' },
    select: {
      workspace: {
        select: {
          id: true,
          name: true,
          memberships: {
            orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
            select: { role: true, user: { select: { id: true, name: true, email: true } } },
          },
        },
      },
    },
  });
  return owned.map(({ workspace }) => {
    const others = workspace.memberships.filter((member) => member.user.id !== userId);
    const owners = others.filter((member) => member.role === 'OWNER').map((m) => m.user.id);
    return {
      id: workspace.id,
      name: workspace.name,
      fate: others.length === 0 ? 'alone' : owners.length > 0 ? 'shared' : 'choose',
      members: others.map(({ user }) => ({ userId: user.id, name: user.name, email: user.email })),
      owners,
    };
  });
}

export function renderDeletionScheduledEmail({
  appUrl,
  name,
  when,
  link,
}: {
  appUrl: string;
  name: string;
  when: string;
  link: string;
}): RenderedEmail {
  const subject = 'Your Formyx account will be deleted';
  const first = singleLine(name).split(' ')[0] ?? '';
  const title = first ? `We’ll delete your account, ${first}` : 'We’ll delete your account';
  const line = `Your account and its data will be deleted on ${when}. Until then you can keep it: use the button below, or sign in again.`;
  const ignore = 'If you didn’t ask for this, keep your account and change your password.';
  return {
    subject,
    text: [title, '', line, '', `Keep my account: ${link}`, '', ignore].join('\n'),
    html: emailPage({
      appUrl,
      subject,
      preheader: `You have ${String(ACCOUNT_DELETION_DAYS)} days to change your mind.`,
      card: `${heading(title)}
        ${p(`font-size:14px;line-height:21px;color:${COLOR.text};margin-top:12px;`, escapeHtml(line))}
        ${button('Keep my account', link)}`,
      footer: escapeHtml(ignore),
    }),
  };
}

export interface AccountDeletionService {
  describe(userId: string): Promise<AccountDeletion>;
  /**
   * Schedules the deletion with `choices` for the shared workspaces only they own, signs the
   * account out everywhere and emails the undo link. Returns when it will happen.
   */
  schedule(userId: string, choices: WorkspaceDeletionChoice[]): Promise<Date>;
  /** Keeps a signed-in account that was to be deleted. */
  restore(userId: string): Promise<void>;
  /** Keeps the account the emailed link belongs to; false for a link that no longer works. */
  restoreByToken(token: string): Promise<boolean>;
  /** Deletes every account whose week is up; returns how many went. */
  runDue(now?: Date): Promise<number>;
}

export function createAccountDeletionService({
  prisma,
  billing,
  mailer,
  logger,
  appUrl,
  now = () => new Date(),
}: {
  prisma: Database;
  billing: DeletionBilling;
  mailer: Mailer;
  logger: Logger;
  appUrl: string;
  now?: () => Date;
}): AccountDeletionService {
  async function cancel(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { deletionScheduledFor: true, deletionPlan: true },
    });
    if (!user?.deletionScheduledFor) return;
    const plan = storedPlanSchema.safeParse(user.deletionPlan);
    await prisma.user.update({
      where: { id: userId },
      data: { deletionScheduledFor: null, deletionPlan: Prisma.DbNull, deletionUndoHash: null },
    });
    if (plan.success && plan.data.requestId) {
      await completeDataRequest(prisma, plan.data.requestId, 'CANCELLED');
    }
  }

  /** Carries out one account's deletion. Throws, deleting nothing, if a plan can't be ended. */
  async function execute(userId: string, plan: StoredPlan): Promise<void> {
    const owned = await ownedWorkspaces(prisma, userId);
    const choices = new Map(plan.workspaces.map((choice) => [choice.workspaceId, choice]));
    const toDelete: string[] = [];
    const toTransfer: { workspaceId: string; heir: string }[] = [];
    for (const workspace of owned) {
      if (workspace.fate === 'alone') {
        toDelete.push(workspace.id);
        continue;
      }
      const choice = choices.get(workspace.id);
      if (workspace.fate === 'choose' && choice?.action === 'delete') {
        toDelete.push(workspace.id);
        continue;
      }
      // Shared: the chosen member if they are still in it, else whoever has been there longest.
      const chosen = choice?.action === 'transfer' ? choice.toUserId : undefined;
      const heir =
        workspace.owners[0] ??
        workspace.members.find((member) => member.userId === chosen)?.userId ??
        workspace.members[0]?.userId;
      if (heir) toTransfer.push({ workspaceId: workspace.id, heir });
    }

    // Plans first, so nothing is deleted while it could still be charged for.
    for (const workspaceId of toDelete) await billing.endForDeletion(workspaceId);
    for (const { workspaceId } of toTransfer) await billing.stopRenewing(workspaceId, userId);

    await prisma.$transaction(async (tx) => {
      for (const { workspaceId, heir } of toTransfer) {
        await tx.membership.update({
          where: { userId_workspaceId: { userId: heir, workspaceId } },
          data: { role: 'OWNER' },
        });
        await handOver(tx, workspaceId, userId, heir);
      }
      // Workspaces they were only a member of keep what they made, with an owner.
      const memberOf = await tx.membership.findMany({
        where: { userId, role: { not: 'OWNER' } },
        select: { workspaceId: true },
      });
      for (const { workspaceId } of memberOf) {
        const owner = await tx.membership.findFirst({
          where: { workspaceId, role: 'OWNER' },
          orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
          select: { userId: true },
        });
        if (owner) await handOver(tx, workspaceId, userId, owner.userId);
      }
      await tx.workspace.deleteMany({ where: { id: { in: toDelete } } });
      // Memberships, sign-in methods, exports and the rest go with the account (cascades).
      await tx.user.delete({ where: { id: userId } });
    });
    if (plan.requestId) {
      await completeDataRequest(prisma, plan.requestId, 'DONE', {
        workspacesDeleted: toDelete.length,
        workspacesTransferred: toTransfer.length,
      });
    }
  }

  return {
    async describe(userId) {
      const [user, owned] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { deletionScheduledFor: true } }),
        ownedWorkspaces(prisma, userId),
      ]);
      return {
        scheduledFor: user?.deletionScheduledFor?.toISOString() ?? null,
        workspaces: await Promise.all(
          owned.map(async ({ owners: _owners, ...workspace }) => ({
            ...workspace,
            paidPlan: await billing.hasRunningPlan(workspace.id),
          })),
        ),
      };
    },

    async schedule(userId, choices) {
      const owned = await ownedWorkspaces(prisma, userId);
      const plan: AccountDeletionPlan = { workspaces: [] };
      const issues: { path: string; message: string }[] = [];
      for (const workspace of owned.filter(({ fate }) => fate === 'choose')) {
        const choice = choices.find(({ workspaceId }) => workspaceId === workspace.id);
        if (!choice) {
          issues.push({
            path: `workspaces.${workspace.id}`,
            message: `Choose what happens to ${workspace.name}`,
          });
        } else if (
          choice.action === 'transfer' &&
          !workspace.members.some((member) => member.userId === choice.toUserId)
        ) {
          issues.push({
            path: `workspaces.${workspace.id}`,
            message: `Choose a member of ${workspace.name}`,
          });
        } else {
          plan.workspaces.push(choice);
        }
      }
      if (issues.length > 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Choose what happens to each workspace.', {
          details: issues,
        });
      }

      const at = new Date(now().getTime() + ACCOUNT_DELETION_DAYS * DAY_MS);
      const token = randomBytes(32).toString('base64url');
      const requestId = await logDataRequest(prisma, {
        kind: 'ACCOUNT_DELETION',
        userId,
        details: {
          scheduledFor: at.toISOString(),
          workspacesToDelete:
            owned.filter(({ fate }) => fate === 'alone').length +
            plan.workspaces.filter(({ action }) => action === 'delete').length,
          workspacesToTransfer: plan.workspaces.filter(({ action }) => action === 'transfer')
            .length,
        },
      });
      const stored: StoredPlan = { ...plan, requestId };
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          deletionScheduledFor: at,
          deletionPlan: stored,
          deletionUndoHash: hashToken(token),
          // Every session ends: signing in again is how to keep the account.
          passwordVersion: { increment: 1 },
        },
        select: { name: true, email: true, preferences: true },
      });
      const email = renderDeletionScheduledEmail({
        appUrl,
        name: user.name,
        when: `${formatDateTime(at.toISOString(), 'UTC')} (UTC)`,
        link: `${appUrl}/account/restore?token=${encodeURIComponent(token)}`,
      });
      try {
        await mailer.send([{ to: user.email, ...email }], {
          idempotencyKey: `account-deletion-${requestId}`,
        });
      } catch (error) {
        // Signing in again still keeps the account, so a lost email loses nothing.
        logger.error({ err: error, userId }, 'Could not email the account deletion link');
      }
      return at;
    },

    restore: cancel,

    async restoreByToken(token) {
      const user = await prisma.user.findUnique({
        where: { deletionUndoHash: hashToken(token) },
        select: { id: true },
      });
      if (!user) return false;
      await cancel(user.id);
      return true;
    },

    async runDue(at = now()) {
      const due = await prisma.user.findMany({
        where: { deletionScheduledFor: { lte: at } },
        select: { id: true, deletionPlan: true },
        take: 50,
      });
      let deleted = 0;
      for (const user of due) {
        const plan = storedPlanSchema.safeParse(user.deletionPlan);
        try {
          await execute(user.id, plan.success ? plan.data : { workspaces: [] });
          deleted += 1;
        } catch (error) {
          // Kept for the next hour: usually Razorpay could not be reached to end a plan.
          logger.error({ err: error, userId: user.id }, 'Could not delete an account yet');
        }
      }
      return deleted;
    },
  };
}
