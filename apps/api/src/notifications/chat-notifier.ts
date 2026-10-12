import { CHAT_SERVICES, formResponsesPath, type ChatService } from '@formyx/shared';
import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { EventBus } from '../lib/events.js';
import type { Database } from '../lib/prisma.js';
import type { SecretBox } from '../lib/webhook-signature.js';
import type { WebhookTransport } from '../lib/webhook-transport.js';
import { createSubmissionService } from '../services/submission-service.js';
import { chatMessageBody } from './chat-message.js';

interface ChatNotifierDependencies {
  env: Pick<Env, 'APP_URL'>;
  logger: Logger;
  prisma: Database;
  events: EventBus;
  /** Posts to Slack's and Discord's webhook hosts only (see `chatWebhookProblem`). */
  chat: WebhookTransport;
  secrets: SecretBox;
}

/**
 * Posts each new response to the form's Slack and Discord channels, once, as soon as it is
 * saved; whatever the email frequency. Failures are logged and never retried: a chat
 * message is a nudge, and the response itself is safe.
 */
export function registerChatNotifier({
  env,
  logger,
  prisma,
  events,
  chat,
  secrets,
}: ChatNotifierDependencies): () => void {
  const submissions = createSubmissionService(prisma);

  return events.on('submission.created', async ({ formId, submission }) => {
    const form = await prisma.form.findUnique({
      where: { id: formId },
      select: { slackWebhookEncrypted: true, discordWebhookEncrypted: true },
    });
    const sealed: Record<ChatService, string | null> = {
      slack: form?.slackWebhookEncrypted ?? null,
      discord: form?.discordWebhookEncrypted ?? null,
    };
    const services = CHAT_SERVICES.filter((service) => sealed[service] !== null);
    if (services.length === 0) return;

    const { title, schema } = await submissions.published(formId);
    const responseUrl = `${env.APP_URL}${formResponsesPath(formId, { responseId: submission.id })}`;
    await Promise.all(
      services.map(async (service) => {
        const context = { formId, submissionId: submission.id, service };
        try {
          const url = secrets.decrypt(sealed[service] ?? '');
          const { statusCode } = await chat({
            url,
            body: chatMessageBody(service, { formTitle: title, schema, submission, responseUrl }),
            headers: { 'Content-Type': 'application/json' },
          });
          if (statusCode < 200 || statusCode >= 300) {
            logger.warn({ ...context, statusCode }, 'A chat webhook refused a new response');
          }
        } catch (error) {
          logger.error({ ...context, err: error }, 'Could not post a new response to chat');
        }
      }),
    );
  });
}
