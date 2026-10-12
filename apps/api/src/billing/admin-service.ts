import {
  effectivePlan,
  TRIAL_PLAN,
  type AdminWorkspace,
  type ExtendTrialInput,
  type GrantComplimentaryInput,
} from '@formyx/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import { escapeLikePattern } from '../lib/like-pattern.js';
import type { Database } from '../lib/prisma.js';
import { WORKSPACE_BILLING_SELECT } from '../services/entitlement-service.js';

/*
 * What Formyx's admins do in /admin: find a workspace, see where its billing stands, give it a
 * complimentary plan for a while (testers, friends) and extend a trial. Every change is kept
 * in admin_actions.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const SEARCH_RESULTS = 25;

const adminSelect = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  ...WORKSPACE_BILLING_SELECT,
  memberships: {
    where: { role: 'OWNER' },
    select: { user: { select: { name: true, email: true } } },
  },
  subscriptions: {
    where: { status: { not: 'CREATED' } },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
  _count: { select: { forms: true } },
} satisfies Prisma.WorkspaceSelect;

type AdminRecord = Prisma.WorkspaceGetPayload<{ select: typeof adminSelect }>;

function toAdminWorkspace(record: AdminRecord, now: Date): AdminWorkspace {
  const subscription = record.subscriptions[0];
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    createdAt: record.createdAt.toISOString(),
    owners: record.memberships.map(({ user }) => user),
    plan: record.plan,
    effectivePlan: effectivePlan(record, now),
    planStatus: record.planStatus,
    trialEndsAt: record.trialEndsAt?.toISOString() ?? null,
    graceEndsAt: record.graceEndsAt?.toISOString() ?? null,
    complimentaryPlan: record.complimentaryPlan,
    complimentaryUntil: record.complimentaryUntil?.toISOString() ?? null,
    subscription: subscription
      ? {
          id: subscription.razorpaySubscriptionId,
          plan: subscription.plan,
          interval: subscription.interval === 'MONTHLY' ? 'monthly' : 'yearly',
          status: subscription.status.toLowerCase() as NonNullable<
            AdminWorkspace['subscription']
          >['status'],
          currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
    forms: record._count.forms,
  };
}

export function createAdminService(prisma: Database, now: () => Date = () => new Date()) {
  async function get(workspaceId: string): Promise<AdminWorkspace> {
    const record = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: adminSelect,
    });
    if (!record) throw new AppError(404, 'NOT_FOUND', 'Workspace not found');
    return toAdminWorkspace(record, now());
  }

  const record = (adminId: string, workspaceId: string, action: string, details: object) =>
    prisma.adminAction.create({ data: { adminId, workspaceId, action, details } });

  return {
    get,

    /** Workspaces whose name, slug or an owner's email has `query` in it; the newest without one. */
    async search(query: string): Promise<AdminWorkspace[]> {
      const text = escapeLikePattern(query);
      const where: Prisma.WorkspaceWhereInput = text
        ? {
            OR: [
              { name: { contains: text, mode: 'insensitive' } },
              { slug: { contains: text, mode: 'insensitive' } },
              {
                memberships: {
                  some: { role: 'OWNER', user: { email: { contains: text, mode: 'insensitive' } } },
                },
              },
            ],
          }
        : {};
      const records = await prisma.workspace.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: SEARCH_RESULTS,
        select: adminSelect,
      });
      const at = now();
      return records.map((found) => toAdminWorkspace(found, at));
    },

    /** Gives the plan for `days` from now, replacing any complimentary plan it had. */
    async grantComplimentary(adminId: string, workspaceId: string, input: GrantComplimentaryInput) {
      await get(workspaceId);
      const until = new Date(now().getTime() + input.days * DAY_MS);
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { complimentaryPlan: input.plan, complimentaryUntil: until },
      });
      await record(adminId, workspaceId, 'grant_complimentary', {
        plan: input.plan,
        until: until.toISOString(),
        ...(input.note && { note: input.note }),
      });
      return get(workspaceId);
    },

    async endComplimentary(adminId: string, workspaceId: string) {
      await get(workspaceId);
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { complimentaryPlan: null, complimentaryUntil: null },
      });
      await record(adminId, workspaceId, 'end_complimentary', {});
      return get(workspaceId);
    },

    /**
     * Adds days to a running trial, or gives a trial again to a workspace on Free whose trial
     * ended. A workspace that pays for a plan has no trial to extend.
     */
    async extendTrial(adminId: string, workspaceId: string, { days }: ExtendTrialInput) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { plan: true, planStatus: true, trialEndsAt: true },
      });
      if (!workspace) throw new AppError(404, 'NOT_FOUND', 'Workspace not found');
      const at = now();
      const trialing = workspace.planStatus === 'TRIALING';
      if (!trialing && workspace.plan !== 'FREE') {
        throw new AppError(409, 'CONFLICT', 'This workspace pays for a plan: there is no trial.');
      }
      const from =
        trialing && workspace.trialEndsAt && workspace.trialEndsAt > at
          ? workspace.trialEndsAt
          : at;
      const trialEndsAt = new Date(from.getTime() + days * DAY_MS);
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          plan: trialing ? workspace.plan : TRIAL_PLAN,
          planStatus: 'TRIALING',
          trialEndsAt,
          downgradedFrom: null,
          downgradedAt: null,
        },
      });
      await record(adminId, workspaceId, 'extend_trial', {
        days,
        trialEndsAt: trialEndsAt.toISOString(),
      });
      return get(workspaceId);
    },
  };
}
