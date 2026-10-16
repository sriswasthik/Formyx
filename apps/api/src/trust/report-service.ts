import { createHash } from 'node:crypto';
import type { ReportFormInput } from '@formyx/shared';
import { reportFormInputSchema } from '@formyx/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
import { readModeration } from './form-moderation.js';

/*
 * "Report this form", on every public form. Reporters stay anonymous: a report keeps a hash of
 * their address and the day, enough to count each person once a day and nothing more. Enough
 * different people reporting a form holds it for review at once, without waiting for an admin.
 */

/** Open reports from different people that hold a form for review. */
export const REPORTS_TO_HOLD = 3;

export interface ReportService {
  /** Files a report; a second one from the same person the same day changes nothing. */
  report(slug: string, input: ReportFormInput, ip: string): Promise<void>;
}

/** One person, one day: SHA-256 of a server secret, their address and the date. */
export function reporterHash(secret: string, ip: string, now: Date = new Date()): string {
  return createHash('sha256')
    .update(`${secret}:${ip}:${now.toISOString().slice(0, 10)}`)
    .digest('hex');
}

export function createReportService({
  prisma,
  secret,
}: {
  prisma: Database;
  /** Salts the reporters' hashes (JWT_SECRET). */
  secret: string;
}): ReportService {
  async function findForm(slug: string) {
    const select = { id: true, status: true, publishedAt: true, moderation: true } as const;
    const current = await prisma.form.findUnique({ where: { slug }, select });
    if (current) return current;
    const old = await prisma.formSlug.findUnique({ where: { slug }, select: { formId: true } });
    return old ? prisma.form.findUnique({ where: { id: old.formId }, select }) : null;
  }

  return {
    async report(slug, input, ip) {
      const { reason, details } = reportFormInputSchema.parse(input);
      const form = await findForm(slug);
      // Only forms people can have seen: published at least once.
      if (!form?.publishedAt) throw new AppError(404, 'NOT_FOUND', 'Form not found');
      try {
        await prisma.formReport.create({
          data: {
            formId: form.id,
            reason,
            details: details ?? null,
            reporterHash: reporterHash(secret, ip),
          },
        });
      } catch (error) {
        // Already reported today by this person: nothing more to do.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return;
        }
        throw error;
      }

      if (form.status !== 'PUBLISHED' && form.status !== 'CLOSED') return;
      const open = await prisma.formReport.count({
        where: { formId: form.id, resolvedAt: null },
      });
      if (open < REPORTS_TO_HOLD) return;
      // Only while it is still live: an admin's decision since then stands.
      await prisma.form.updateMany({
        where: { id: form.id, status: form.status },
        data: {
          status: 'UNDER_REVIEW',
          moderation: { ...readModeration(form.moderation), heldFor: 'reports' },
        },
      });
    },
  };
}
