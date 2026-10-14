import {
  formResponsesPath,
  isFileAnswer,
  normalizeEmail,
  readLiveSettings,
  readWorkspacePreferences,
  type SubmissionRecord,
} from '@formyx/shared';
import type { Logger } from 'pino';
import type { EmailMessage, Mailer } from '../lib/mailer.js';
import type { Database } from '../lib/prisma.js';
import type { UploadStorage } from '../lib/upload-storage.js';
import { DIGEST_RESPONSE_LIMIT, renderDigestEmail } from '../notifications/digest-email.js';
import { createNotificationService } from '../services/notification-service.js';
import { createSubmissionService, submissionBatches } from '../services/submission-service.js';

/*
 * Work that happens on a schedule rather than on a request: daily digests of new responses,
 * and deleting responses older than a form keeps them. `pnpm --filter @formyx/api jobs` runs
 * both; a cron job runs that hourly (render.yaml). Each is idempotent, so running it twice
 * in an hour, or after missing one, does no harm.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** A digest goes at most this often, even if the job runs twice in its hour. */
const DIGEST_MIN_GAP_MS = 20 * HOUR_MS;
const RETENTION_BATCH = 500;

export interface JobDependencies {
  prisma: Database;
  mailer: Mailer;
  /**
   * Queues a digest instead of sending it now (the hourly upkeep job does, so a failing email
   * service is retried and shows on the form's Integrations page).
   */
  queueEmail?: (email: {
    formId: string;
    messages: EmailMessage[];
    idempotencyKey: string;
  }) => Promise<void>;
  storage: UploadStorage | null;
  logger: Logger;
  appUrl: string;
  now?: Date;
}

/** The hour (0 to 23) it is at `now` in `timeZone`. */
export function hourIn(timeZone: string, now: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone })
    .formatToParts(now)
    .find((part) => part.type === 'hour')?.value;
  return Number(hour ?? '0');
}

/**
 * Sends each form that asks for a daily digest its digest, when it is the form's digest hour
 * in its workspace's time zone. Forms with nothing new get nothing.
 */
export async function sendDigests({
  prisma,
  mailer,
  queueEmail,
  logger,
  appUrl,
  now = new Date(),
}: JobDependencies): Promise<{ sent: number }> {
  const notifications = createNotificationService(prisma);
  const submissions = createSubmissionService(prisma);
  const forms = await prisma.form.findMany({
    where: { liveSettings: { path: ['notifications', 'frequency'], equals: 'daily' } },
    select: {
      id: true,
      liveSettings: true,
      lastDigestAt: true,
      workspace: { select: { preferences: true } },
    },
  });

  let sent = 0;
  for (const form of forms) {
    const settings = readLiveSettings(form.liveSettings).notifications;
    const { timeZone } = readWorkspacePreferences(form.workspace.preferences);
    if (hourIn(timeZone, now) !== settings.digestHour) continue;
    if (form.lastDigestAt && now.getTime() - form.lastDigestAt.getTime() < DIGEST_MIN_GAP_MS) {
      continue;
    }
    const since = form.lastDigestAt ?? new Date(now.getTime() - DAY_MS);
    const where = { formId: form.id, createdAt: { gt: since, lte: now } };
    const [total, members] = await Promise.all([
      prisma.submission.count({ where }),
      notifications.recipients(form.id),
    ]);
    const recipients = [
      ...new Set([...members.map(({ email }) => email), ...settings.emails].map(normalizeEmail)),
    ];
    // Marked first: a failure below means a missed digest, never a doubled one.
    await prisma.form.update({ where: { id: form.id }, data: { lastDigestAt: now } });
    if (total === 0 || recipients.length === 0) continue;

    let latest: SubmissionRecord[] = [];
    for await (const batch of submissionBatches(prisma, form.id, { size: DIGEST_RESPONSE_LIMIT })) {
      latest = batch;
      break;
    }
    const { title, schema } = await submissions.published(form.id);
    const email = renderDigestEmail({
      formTitle: title,
      schema,
      submissions: latest.filter(
        (submission) => new Date(submission.createdAt).getTime() > since.getTime(),
      ),
      total,
      responsesUrl: `${appUrl}${formResponsesPath(form.id)}`,
      settingsUrl: `${appUrl}/app/forms/${form.id}/settings?section=notifications`,
      appUrl,
    });
    const messages = recipients.map((to) => ({ to, ...email }));
    const idempotencyKey = `digest/${form.id}/${now.toISOString().slice(0, 13)}`;
    try {
      if (queueEmail) await queueEmail({ formId: form.id, messages, idempotencyKey });
      else await mailer.send(messages, { idempotencyKey });
      sent += 1;
    } catch (error) {
      logger.error({ formId: form.id, err: error }, 'Could not send a digest');
    }
  }
  return { sent };
}

/**
 * Deletes responses older than each form keeps them, with the files uploaded with them.
 * Files go first: a response is only deleted once its files are, so none are left behind
 * with nothing pointing at them.
 */
export async function applyRetention({
  prisma,
  storage,
  logger,
  now = new Date(),
}: JobDependencies): Promise<{ deleted: number }> {
  const forms = await prisma.$queryRaw<{ id: string; liveSettings: unknown }[]>`
    SELECT id, live_settings AS "liveSettings" FROM forms
    WHERE jsonb_typeof(live_settings #> '{data,retentionDays}') = 'number'
  `;

  let deleted = 0;
  for (const form of forms) {
    const { retentionDays } = readLiveSettings(form.liveSettings).data;
    if (retentionDays === null) continue;
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    for (;;) {
      const old = await prisma.submission.findMany({
        where: { formId: form.id, createdAt: { lt: cutoff } },
        select: { id: true, answers: true },
        take: RETENTION_BATCH,
      });
      if (old.length === 0) break;
      const files = old.flatMap(({ answers }) =>
        Object.values(typeof answers === 'object' && answers !== null ? answers : {}).filter(
          isFileAnswer,
        ),
      );
      if (files.length > 0) {
        if (!storage) {
          logger.warn({ formId: form.id }, 'Kept old responses with files: uploads are off');
          break;
        }
        try {
          await storage.deleteFiles(files.map((file) => file.url));
        } catch (error) {
          logger.error({ formId: form.id, err: error }, 'Could not delete old uploaded files');
          break;
        }
      }
      const { count } = await prisma.submission.deleteMany({
        where: { id: { in: old.map(({ id }) => id) } },
      });
      deleted += count;
      if (old.length < RETENTION_BATCH) break;
    }
  }
  if (deleted > 0) logger.info({ deleted }, "Deleted responses past their forms' retention");
  return { deleted };
}

/** Housekeeping: codes and drafts past their time. */
export async function pruneExpired({ prisma, now = new Date() }: JobDependencies) {
  const [codes, drafts] = await prisma.$transaction([
    prisma.respondentVerification.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.formDraft.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return { codes: codes.count, drafts: drafts.count };
}
