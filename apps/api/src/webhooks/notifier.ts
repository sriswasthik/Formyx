import type { Logger } from 'pino';
import type { EventBus } from '../lib/events.js';
import type { Database } from '../lib/prisma.js';
import { createSubmissionService } from '../services/submission-service.js';
import type { WebhookDispatcher } from './dispatcher.js';
import { submissionPayload } from './payload.js';

interface NotifierDependencies {
  logger: Logger;
  prisma: Database;
  events: EventBus;
  webhooks: WebhookDispatcher;
}

/**
 * Queues a `submission.created` event for each of the form's webhooks once a response is
 * saved. The respondent's request has already been answered, so slow or failing receivers
 * never hold it up.
 */
export function registerWebhookNotifier({
  logger,
  prisma,
  events,
  webhooks,
}: NotifierDependencies): () => void {
  const submissions = createSubmissionService(prisma);

  return events.on('submission.created', async ({ formId, submission }) => {
    try {
      const targets = await prisma.webhook.findMany({
        where: { formId },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (targets.length === 0) return;

      const { title, schema } = await submissions.published(formId);
      for (const { id } of targets) {
        webhooks.enqueue(id, submissionPayload({ id: formId, title, schema }, submission));
      }
    } catch (error) {
      logger.error(
        { formId, submissionId: submission.id, err: error },
        'Could not queue webhook events',
      );
    }
  });
}
