import type { Logger } from 'pino';
import type { JobQueue } from '../jobs/queue.js';
import type { EventBus } from '../lib/events.js';
import type { Database } from '../lib/prisma.js';
import { createSubmissionService } from '../services/submission-service.js';
import type { WebhookDispatcher } from './dispatcher.js';
import { submissionPayload } from './payload.js';

interface NotifierDependencies {
  logger: Logger;
  prisma: Database;
  events: EventBus;
  jobs: JobQueue;
  webhooks: WebhookDispatcher;
}

/**
 * Queues a `submission.created` event for each of the form's webhooks once a response is
 * saved. The respondent's request has already been answered, so slow or failing receivers
 * never hold it up; the queue retries failures with backoff.
 */
export function registerWebhookNotifier({
  logger,
  prisma,
  events,
  jobs,
  webhooks,
}: NotifierDependencies): () => void {
  const submissions = createSubmissionService(prisma);

  jobs.handle('webhook.deliver', ({ webhookId, payload, body }, { attempt }) =>
    webhooks.deliver({ webhookId, payload, body, attempt }),
  );

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
        const payload = submissionPayload({ id: formId, title, schema }, submission);
        await jobs.send('webhook.deliver', {
          formId,
          webhookId: id,
          payload,
          body: JSON.stringify(payload),
        });
      }
    } catch (error) {
      logger.error(
        { formId, submissionId: submission.id, err: error },
        'Could not queue webhook events',
      );
    }
  });
}
