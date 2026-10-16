import {
  type AdminFormAction,
  type AdminFormReview,
  type AdminReviewItem,
  type FormStatus,
  reportReasonSchema,
} from '@formyx/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
import { parsePublishedSchema } from '../services/form-service.js';
import { approveModeration, readModeration, reviewReasons } from './form-moderation.js';

/*
 * What /admin's reviewers see and do: forms held when published or reported by visitors, and
 * accounts to suspend. Every action is recorded in admin_actions with the admin and a note.
 */

const QUEUE_SIZE = 100;

const itemSelect = {
  id: true,
  title: true,
  publishedTitle: true,
  slug: true,
  status: true,
  updatedAt: true,
  moderation: true,
  workspace: { select: { id: true, name: true } },
  createdBy: {
    select: { id: true, name: true, email: true, createdAt: true, suspendedAt: true },
  },
  _count: { select: { reports: { where: { resolvedAt: null } } } },
} satisfies Prisma.FormSelect;

type ItemRecord = Prisma.FormGetPayload<{ select: typeof itemSelect }>;

function toItem(form: ItemRecord): AdminReviewItem {
  const moderation = readModeration(form.moderation);
  const held = form.status === 'UNDER_REVIEW';
  return {
    formId: form.id,
    title: form.publishedTitle ?? form.title,
    slug: form.slug,
    status: form.status,
    workspace: form.workspace,
    creator: form.createdBy && {
      id: form.createdBy.id,
      name: form.createdBy.name,
      email: form.createdBy.email,
      createdAt: form.createdBy.createdAt.toISOString(),
      suspended: form.createdBy.suspendedAt !== null,
    },
    heldFor: held ? (moderation.heldFor ?? 'content') : null,
    reasons: held ? reviewReasons(moderation) : [],
    openReports: form._count.reports,
    updatedAt: form.updatedAt.toISOString(),
  };
}

/** What each action needs the form to be, and what it becomes. */
const TRANSITIONS: Record<AdminFormAction, { from: FormStatus[]; to: FormStatus | null }> = {
  approve: { from: ['UNDER_REVIEW'], to: 'PUBLISHED' },
  dismiss_reports: { from: ['PUBLISHED', 'CLOSED'], to: null },
  unpublish: { from: ['PUBLISHED', 'CLOSED', 'UNDER_REVIEW'], to: 'DRAFT' },
  suspend: { from: ['DRAFT', 'PUBLISHED', 'CLOSED', 'UNDER_REVIEW'], to: 'SUSPENDED' },
  restore: { from: ['SUSPENDED'], to: 'DRAFT' },
};

export interface ReviewService {
  queue(): Promise<AdminReviewItem[]>;
  get(formId: string): Promise<AdminFormReview>;
  act(
    adminId: string,
    formId: string,
    action: AdminFormAction,
    note?: string,
  ): Promise<AdminFormReview>;
  /** Suspends (or reinstates) an account: it can't sign in, and its forms are unavailable. */
  setUserSuspended(
    adminId: string,
    userId: string,
    suspended: boolean,
    note?: string,
  ): Promise<void>;
}

export function createReviewService(prisma: Database): ReviewService {
  const notFound = () => new AppError(404, 'NOT_FOUND', 'Form not found');

  async function get(formId: string): Promise<AdminFormReview> {
    const form = await prisma.form.findUnique({
      where: { id: formId },
      select: {
        ...itemSelect,
        publishedSchema: true,
        reports: {
          where: { resolvedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, reason: true, details: true, createdAt: true },
        },
      },
    });
    if (!form) throw notFound();
    const moderation = readModeration(form.moderation);
    const schema = parsePublishedSchema(form.publishedSchema);
    const history = await prisma.adminAction.findMany({
      where: {
        OR: [
          { details: { path: ['formId'], equals: form.id } },
          ...(form.createdBy ? [{ details: { path: ['userId'], equals: form.createdBy.id } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { action: true, details: true, createdAt: true, admin: { select: { name: true } } },
    });
    return {
      ...toItem(form),
      matches: moderation.matches.map(({ label, path, excerpt }) => ({ label, path, excerpt })),
      unsafeLinks: moderation.unsafeLinks,
      reports: form.reports.map((report) => ({
        id: report.id,
        reason: reportReasonSchema.catch('other').parse(report.reason),
        details: report.details,
        createdAt: report.createdAt.toISOString(),
      })),
      questions: (schema?.fields ?? [])
        .map((field) => field.label.trim())
        .filter((label) => label !== ''),
      history: history.map((entry) => {
        const details = entry.details as { note?: unknown } | null;
        return {
          action: entry.action,
          note: typeof details?.note === 'string' ? details.note : null,
          adminName: entry.admin?.name ?? null,
          createdAt: entry.createdAt.toISOString(),
        };
      }),
    };
  }

  return {
    async queue() {
      const forms = await prisma.form.findMany({
        where: {
          OR: [{ status: 'UNDER_REVIEW' }, { reports: { some: { resolvedAt: null } } }],
        },
        orderBy: { updatedAt: 'desc' },
        take: QUEUE_SIZE,
        select: itemSelect,
      });
      // Held forms first: nobody can reach them until someone decides.
      return forms
        .map(toItem)
        .sort((a, b) => Number(b.status === 'UNDER_REVIEW') - Number(a.status === 'UNDER_REVIEW'));
    },

    get,

    async act(adminId, formId, action, note) {
      const form = await prisma.form.findUnique({
        where: { id: formId },
        select: { id: true, status: true, workspaceId: true, moderation: true },
      });
      if (!form) throw notFound();
      const { from, to } = TRANSITIONS[action];
      if (!from.includes(form.status)) {
        throw new AppError(
          409,
          'CONFLICT',
          `A ${form.status.toLowerCase()} form can't be given "${action}".`,
        );
      }
      const now = new Date();
      // Approved: what it was held for is let through from now on, and it is no longer held.
      const { heldFor: _heldFor, ...approved } = approveModeration(
        readModeration(form.moderation),
        now,
      );
      await prisma.$transaction([
        prisma.form.update({
          where: { id: form.id },
          data: {
            ...(to && { status: to }),
            ...(action === 'approve' && { moderation: approved }),
          },
        }),
        // Whatever was decided answers the open reports.
        prisma.formReport.updateMany({
          where: { formId: form.id, resolvedAt: null },
          data: { resolvedAt: now, resolution: action, resolvedById: adminId },
        }),
        prisma.adminAction.create({
          data: {
            adminId,
            workspaceId: form.workspaceId,
            action: `form.${action}`,
            details: { formId: form.id, ...(note && { note }) },
          },
        }),
      ]);
      return get(form.id);
    },

    async setUserSuspended(adminId, userId, suspended, note) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isAdmin: true },
      });
      if (!user) throw new AppError(404, 'NOT_FOUND', 'Account not found');
      if (user.isAdmin) throw new AppError(403, 'FORBIDDEN', 'Admins can’t be suspended here.');
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { suspendedAt: suspended ? new Date() : null },
        }),
        prisma.adminAction.create({
          data: {
            adminId,
            action: suspended ? 'user.suspend' : 'user.unsuspend',
            details: { userId: user.id, ...(note && { note }) },
          },
        }),
      ]);
    },
  };
}
