import { CHAT_SERVICES, formResponsesPath, type ChatService } from '@formyx/shared';
import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { SubmissionChange } from '../jobs/job-types.js';
import { PermanentJobError, type JobQueue } from '../jobs/queue.js';
import type { Encryption } from '../lib/encryption.js';
import type { EventBus, SubmissionEvent } from '../lib/events.js';
import type { Database } from '../lib/prisma.js';
import type { WebhookTransport } from '../lib/webhook-transport.js';
import { parsePublishedTheme } from '../services/form-service.js';
import { createSubmissionService } from '../services/submission-service.js';
import { chatMessageBody } from './chat-message.js';

interface ChatNotifierDependencies {
  env: Pick<Env, 'APP_URL'>;
  logger: Logger;
  prisma: Database;
  events: EventBus;
  jobs: JobQueue;
  /** Posts to Slack's and Discord's webhook hosts only (see `chatWebhookProblem`). */
  chat: WebhookTransport;
  encryption: Encryption;
}

const COLUMN: Record<ChatService, 'slackWebhookEncrypted' | 'discordWebhookEncrypted'> = {
  slack: 'slackWebhookEncrypted',
  discord: 'discordWebhookEncrypted',
};

/**
 * Posts each new response, and each response its respondent changes, to the form's Slack and
 * Discord channels, whatever the email frequency. Posts are jobs, so a channel that's briefly
 * unreachable gets the message a little later.
 */
export function registerChatNotifier({
  env,
  logger,
  prisma,
  events,
  jobs,
  chat,
  encryption,
}: ChatNotifierDependencies): () => void {
  const submissions = createSubmissionService(prisma);

  jobs.handle('chat.post', async ({ formId, service, submissionId, change }) => {
    const form = await prisma.form.findUnique({
      where: { id: formId },
      select: {
        slackWebhookEncrypted: true,
        discordWebhookEncrypted: true,
        publishedTheme: true,
        theme: true,
      },
    });
    const sealed = form?.[COLUMN[service]];
    // Disconnected meanwhile.
    if (!form || !sealed) return;
    let url: string;
    try {
      url = encryption.decrypt(sealed);
    } catch {
      throw new PermanentJobError('The channel’s webhook can’t be read: connect it again.');
    }
    if (encryption.needsReseal(sealed)) {
      await prisma.form.update({
        where: { id: formId },
        data: { [COLUMN[service]]: encryption.encrypt(url) },
      });
    }

    const submission = await submissions.get(formId, submissionId).catch(() => null);
    if (!submission) return;
    const { title, schema } = await submissions.published(formId);
    const theme = parsePublishedTheme(form.publishedTheme ?? form.theme);
    const { statusCode } = await chat({
      url,
      body: chatMessageBody(service, {
        formTitle: title,
        schema,
        submission,
        change,
        accentColor: theme?.colors.primary ?? null,
        responseUrl: `${env.APP_URL}${formResponsesPath(formId, { responseId: submissionId })}`,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (statusCode >= 200 && statusCode < 300) return;
    const name = service === 'slack' ? 'Slack' : 'Discord';
    // Gone for good (the webhook was deleted, or the request was refused as malformed).
    if ([400, 401, 403, 404, 410].includes(statusCode)) {
      throw new PermanentJobError(`${name} refused it (${statusCode}): connect the channel again.`);
    }
    throw new Error(`${name} answered ${statusCode}`);
  });

  const queue = (change: SubmissionChange) => async (event: SubmissionEvent) => {
    const { formId, submission } = event;
    try {
      const form = await prisma.form.findUnique({
        where: { id: formId },
        select: { slackWebhookEncrypted: true, discordWebhookEncrypted: true },
      });
      for (const service of CHAT_SERVICES) {
        if (!form?.[COLUMN[service]]) continue;
        await jobs.send('chat.post', { formId, service, submissionId: submission.id, change });
      }
    } catch (error) {
      logger.error(
        { formId, submissionId: submission.id, err: error },
        'Could not queue chat messages',
      );
    }
  };

  const offCreated = events.on('submission.created', queue('created'));
  const offUpdated = events.on('submission.updated', queue('updated'));
  return () => {
    offCreated();
    offUpdated();
  };
}
