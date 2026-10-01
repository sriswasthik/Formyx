import { formResponsesPath } from '@formyx/shared';
import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { EventBus } from '../lib/events.js';
import type { Mailer } from '../lib/mailer.js';
import type { Database } from '../lib/prisma.js';
import { createNotificationService } from '../services/notification-service.js';
import { createSubmissionService } from '../services/submission-service.js';
import { renderSubmissionEmail } from './submission-email.js';

interface NotifierDependencies {
  env: Pick<Env, 'APP_URL'>;
  logger: Logger;
  prisma: Database;
  mailer: Mailer;
  events: EventBus;
}

/**
 * Emails members who asked for it about each new response. Runs after the response is
 * saved and answered, so a slow or failing email service never touches the respondent;
 * failures are logged.
 */
export function registerSubmissionNotifier({
  env,
  logger,
  prisma,
  mailer,
  events,
}: NotifierDependencies): () => void {
  const notifications = createNotificationService(prisma);
  const submissions = createSubmissionService(prisma);

  return events.on('submission.created', async ({ formId, submission }) => {
    const context = { formId, submissionId: submission.id };
    try {
      const recipients = await notifications.recipients(formId);
      if (recipients.length === 0) return;

      const { title, schema } = await submissions.published(formId);
      const email = renderSubmissionEmail({
        formTitle: title,
        schema,
        submission,
        responseUrl: `${env.APP_URL}${formResponsesPath(formId, { responseId: submission.id })}`,
        settingsUrl: `${env.APP_URL}${formResponsesPath(formId)}`,
      });
      await mailer.send(
        recipients.map(({ email: to }) => ({ to, ...email })),
        { idempotencyKey: `submission-created/${submission.id}` },
      );
      // Counts only: addresses stay out of the logs.
      logger.info({ ...context, recipients: recipients.length }, 'Sent new response emails');
    } catch (error) {
      logger.error({ ...context, err: error }, 'Could not send new response emails');
    }
  });
}
