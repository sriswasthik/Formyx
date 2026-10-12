import { formResponsesPath, normalizeEmail, readLiveSettings } from '@formyx/shared';
import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { EventBus } from '../lib/events.js';
import type { JobQueue } from '../jobs/queue.js';
import type { Encryption } from '../lib/encryption.js';
import type { Database } from '../lib/prisma.js';
import { formAllows } from '../services/entitlement-service.js';
import { createNotificationService } from '../services/notification-service.js';
import { createSubmissionService } from '../services/submission-service.js';
import { queueEmails } from './email-jobs.js';
import { renderSubmissionEmail } from './submission-email.js';

interface NotifierDependencies {
  env: Pick<Env, 'APP_URL' | 'ENTITLEMENTS_MODE'>;
  logger: Logger;
  prisma: Database;
  jobs: JobQueue;
  encryption: Encryption;
  events: EventBus;
}

/**
 * Emails members who asked for it, and any other addresses the form lists, about each new
 * response, unless the form sends a daily digest instead (see `jobs/jobs.ts`). The emails are
 * queued once the response is saved and answered, so a slow or failing email service never
 * touches the respondent, and sending is retried (see notifications/email-jobs.ts).
 */
export function registerSubmissionNotifier({
  env,
  logger,
  prisma,
  jobs,
  encryption,
  events,
}: NotifierDependencies): () => void {
  const notifications = createNotificationService(prisma);
  const submissions = createSubmissionService(prisma);

  return events.on('submission.created', async ({ formId, submission }) => {
    const context = { formId, submissionId: submission.id };
    try {
      const form = await prisma.form.findUnique({
        where: { id: formId },
        select: { liveSettings: true },
      });
      const { notifications: settings } = readLiveSettings(form?.liveSettings);
      if (settings.frequency === 'daily') return;
      const members = await notifications.recipients(formId);
      // Addresses beyond the members need the plan; without it, only members hear.
      const extras =
        settings.emails.length > 0 &&
        (await formAllows(prisma, env.ENTITLEMENTS_MODE, formId, 'extra_recipients'))
          ? settings.emails
          : [];
      // Each address once, members first.
      const recipients = [
        ...new Set([...members.map(({ email }) => email), ...extras].map(normalizeEmail)),
      ];
      if (recipients.length === 0) return;

      const { title, schema } = await submissions.published(formId);
      const email = renderSubmissionEmail({
        formTitle: title,
        schema,
        submission,
        responseUrl: `${env.APP_URL}${formResponsesPath(formId, { responseId: submission.id })}`,
        settingsUrl: `${env.APP_URL}${formResponsesPath(formId)}`,
      });
      await queueEmails(jobs, encryption, {
        formId,
        kind: 'response',
        messages: recipients.map((to) => ({ to, ...email })),
        idempotencyKey: `submission-created/${submission.id}`,
      });
      // Counts only: addresses stay out of the logs.
      logger.info({ ...context, recipients: recipients.length }, 'Queued new response emails');
    } catch (error) {
      logger.error({ ...context, err: error }, 'Could not queue new response emails');
    }
  });
}
