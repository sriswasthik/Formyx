import type { JobFailureView } from '@formyx/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
import { describeJob, type JobName, type JobPayloads } from './job-types.js';
import type { FailedJob, JobQueue } from './queue.js';

/*
 * Jobs that ran out of tries, kept with their data so people can see what went wrong and
 * send them again. Retrying sends a new job with the same data: an email keeps its
 * idempotency key, a webhook its event id and body.
 */

/** Errors can quote what a server sent back; keep them readable. */
const ERROR_MAX_LENGTH = 1000;
/** The newest failures a form lists. */
export const FAILURE_LIST_LIMIT = 50;

export function createFailureRecorder(prisma: Database) {
  return async (failed: FailedJob): Promise<void> => {
    const subject = describeJob(failed.name, failed.data);
    // A form or integration deleted meanwhile has nothing left to show the failure on.
    const [form, integration] = await Promise.all([
      subject.formId
        ? prisma.form.findUnique({ where: { id: subject.formId }, select: { id: true } })
        : null,
      subject.integrationId
        ? prisma.integration.findUnique({
            where: { id: subject.integrationId },
            select: { id: true },
          })
        : null,
    ]);
    if (subject.formId && !form) return;
    await prisma.jobFailure.create({
      data: {
        queue: failed.name,
        jobId: failed.jobId,
        formId: form?.id ?? null,
        integrationId: integration?.id ?? null,
        webhookId: subject.webhookId ?? null,
        summary: subject.summary,
        error: failed.error.slice(0, ERROR_MAX_LENGTH),
        attempts: failed.attempts,
        data: failed.data as Prisma.InputJsonValue,
      },
    });
  };
}

const failureSelect = {
  id: true,
  queue: true,
  integrationId: true,
  webhookId: true,
  summary: true,
  error: true,
  attempts: true,
  createdAt: true,
} as const;

export function createFailureService(prisma: Database, jobs: JobQueue) {
  async function find(formId: string, failureId: string) {
    const failure = await prisma.jobFailure.findFirst({
      where: { id: failureId, formId, resolvedAt: null },
      select: { id: true, queue: true, data: true },
    });
    if (!failure) throw new AppError(404, 'NOT_FOUND', 'That failed job is no longer listed.');
    return failure;
  }

  return {
    /** A form's unresolved failures, newest first. */
    async list(formId: string): Promise<JobFailureView[]> {
      const rows = await prisma.jobFailure.findMany({
        where: { formId, resolvedAt: null },
        orderBy: { createdAt: 'desc' },
        take: FAILURE_LIST_LIMIT,
        select: failureSelect,
      });
      return rows.map((row) => ({
        ...row,
        integrationId: row.integrationId ?? null,
        webhookId: row.webhookId ?? null,
        createdAt: row.createdAt.toISOString(),
      }));
    },

    /** Sends the job again and takes it off the list (a new failure would list it again). */
    async retry(formId: string, failureId: string): Promise<void> {
      const failure = await find(formId, failureId);
      const name = failure.queue as JobName;
      await jobs.send(name, failure.data as unknown as JobPayloads[typeof name]);
      await prisma.jobFailure.update({
        where: { id: failure.id },
        data: { resolvedAt: new Date() },
      });
    },

    async dismiss(formId: string, failureId: string): Promise<void> {
      const failure = await find(formId, failureId);
      await prisma.jobFailure.update({
        where: { id: failure.id },
        data: { resolvedAt: new Date() },
      });
    },

    /** Sends every listed failure of one integration again (after reconnecting it). */
    async retryIntegration(integrationId: string): Promise<number> {
      const failures = await prisma.jobFailure.findMany({
        where: { integrationId, resolvedAt: null },
        select: { id: true, queue: true, data: true },
      });
      for (const failure of failures) {
        const name = failure.queue as JobName;
        await jobs.send(name, failure.data as unknown as JobPayloads[typeof name]);
      }
      await prisma.jobFailure.updateMany({
        where: { id: { in: failures.map(({ id }) => id) } },
        data: { resolvedAt: new Date() },
      });
      return failures.length;
    },
  };
}
