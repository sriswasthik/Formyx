import type { EntitlementsMode, Member, Role, WorkspaceSummary } from '@formyx/shared';
import { claimTrial, trialPlan, trialsStart } from '../billing/trial.js';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
import { isUniqueViolation, workspaceSlug } from './auth-service.js';

const MAX_SLUG_ATTEMPTS = 3;

export interface WorkspaceService {
  /** A new workspace, owned by `userId`. */
  create(userId: string, name: string): Promise<WorkspaceSummary>;
  rename(workspaceId: string, name: string, role: Role): Promise<WorkspaceSummary>;
  /**
   * Deletes the workspace with its forms and responses, cancelling its plan first so it is
   * never charged again. Throws (and deletes nothing) if the plan can't be cancelled.
   */
  remove(workspaceId: string): Promise<void>;
  members(workspaceId: string): Promise<Member[]>;
  /** Throws 409 LAST_OWNER rather than leave the workspace without an owner. */
  changeRole(workspaceId: string, userId: string, role: Role): Promise<Member>;
  /**
   * Removes a member, or lets them leave. What they made (forms, brand kits, webhooks) stays
   * in the workspace and passes to an owner; their response emails for its forms stop.
   * Throws 409 LAST_OWNER for the only owner.
   */
  removeMember(workspaceId: string, userId: string): Promise<void>;
}

/** What deleting a workspace needs from billing (see BillingService.endForDeletion). */
export interface WorkspaceBilling {
  endForDeletion(workspaceId: string): Promise<void>;
}

const memberSelect = {
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

function toMember(membership: {
  role: Role;
  createdAt: Date;
  user: { id: string; name: string; email: string };
}): Member {
  return {
    userId: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    joinedAt: membership.createdAt.toISOString(),
  };
}

function memberNotFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'This person is not a member of the workspace');
}

function lastOwner(): AppError {
  return new AppError(
    409,
    'LAST_OWNER',
    'A workspace needs at least one owner. Make someone else an owner first.',
  );
}

type Transaction = Parameters<Parameters<Database['$transaction']>[0]>[0];

/**
 * Locks the workspace's owner rows for the rest of the transaction and returns their user ids.
 * Two owners demoting each other at once then run one after the other, so the second sees
 * the first's change and the workspace keeps an owner.
 */
async function lockOwners(tx: Transaction, workspaceId: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ user_id: string }[]>`
    SELECT user_id FROM memberships
    WHERE workspace_id = ${workspaceId} AND role = 'OWNER'
    FOR UPDATE
  `;
  return rows.map((row) => row.user_id);
}

/**
 * Passes what `userId` made in the workspace to `heir`, an owner staying on: forms, brand
 * kits and webhooks keep working, with someone in the workspace answerable for them.
 */
export async function handOver(
  tx: Transaction,
  workspaceId: string,
  userId: string,
  heir: string,
): Promise<void> {
  await tx.form.updateMany({
    where: { workspaceId, createdById: userId },
    data: { createdById: heir },
  });
  await tx.brandKit.updateMany({
    where: { workspaceId, createdById: userId },
    data: { createdById: heir },
  });
  await tx.webhook.updateMany({
    where: { createdById: userId, form: { workspaceId } },
    data: { createdById: heir },
  });
  await tx.formSubscription.deleteMany({ where: { userId, form: { workspaceId } } });
}

export function createWorkspaceService(
  prisma: Database,
  mode: EntitlementsMode = 'all_unlocked',
  billing: WorkspaceBilling | null = null,
): WorkspaceService {
  return {
    async create(userId, name) {
      for (let attempt = 1; ; attempt++) {
        try {
          const workspace = await prisma.$transaction(async (tx) => {
            const now = new Date();
            // The owner's first workspace gets their one free trial.
            const trial = trialsStart(mode) && (await claimTrial(tx, userId, now));
            return tx.workspace.create({
              data: {
                name,
                slug: workspaceSlug(name),
                ...(trial && trialPlan(now)),
                memberships: { create: { userId, role: 'OWNER' } },
              },
              select: { id: true, name: true, slug: true },
            });
          });
          return { ...workspace, role: 'OWNER' };
        } catch (error) {
          // A random slug collided: worth another try.
          if (!isUniqueViolation(error) || attempt >= MAX_SLUG_ATTEMPTS) throw error;
        }
      }
    },

    async rename(workspaceId, name, role) {
      const workspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { name },
        select: { id: true, name: true, slug: true },
      });
      return { ...workspace, role };
    },

    async remove(workspaceId) {
      await billing?.endForDeletion(workspaceId);
      await prisma.workspace.delete({ where: { id: workspaceId } });
    },

    async members(workspaceId) {
      const memberships = await prisma.membership.findMany({
        where: { workspaceId },
        select: memberSelect,
        orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
      });
      return memberships.map(toMember);
    },

    async changeRole(workspaceId, userId, role) {
      return prisma.$transaction(async (tx) => {
        const owners = await lockOwners(tx, workspaceId);
        const current = await tx.membership.findUnique({
          where: { userId_workspaceId: { userId, workspaceId } },
          select: { role: true },
        });
        if (!current) throw memberNotFound();
        if (current.role === 'OWNER' && role !== 'OWNER' && owners.length <= 1) {
          throw lastOwner();
        }
        const updated = await tx.membership.update({
          where: { userId_workspaceId: { userId, workspaceId } },
          data: { role },
          select: memberSelect,
        });
        return toMember(updated);
      });
    },

    async removeMember(workspaceId, userId) {
      await prisma.$transaction(async (tx) => {
        const owners = await lockOwners(tx, workspaceId);
        if (owners.includes(userId) && owners.length <= 1) throw lastOwner();
        const { count } = await tx.membership.deleteMany({ where: { workspaceId, userId } });
        if (count === 0) throw memberNotFound();
        // The longest-standing owner who stays (the lock returns them in any order).
        const heir = await tx.membership.findFirst({
          where: { workspaceId, role: 'OWNER', userId: { not: userId } },
          orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
          select: { userId: true },
        });
        if (heir) await handOver(tx, workspaceId, userId, heir.userId);
      });
    },
  };
}
