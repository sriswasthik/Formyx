import type { Logger } from 'pino';
import { Resend } from 'resend';
import type { Env } from '../config/env.js';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  /**
   * Sends every message, or throws. `idempotencyKey` makes a retried call a no-op, so the
   * same messages are never delivered twice.
   */
  send(messages: EmailMessage[], options: { idempotencyKey: string }): Promise<void>;
}

/** Resend accepts at most 100 messages per batch call. */
const RESEND_BATCH_LIMIT = 100;

export function createResendMailer({ apiKey, from }: { apiKey: string; from: string }): Mailer {
  const resend = new Resend(apiKey);

  return {
    async send(messages, { idempotencyKey }) {
      for (let start = 0; start < messages.length; start += RESEND_BATCH_LIMIT) {
        const chunk = messages.slice(start, start + RESEND_BATCH_LIMIT);
        const { error } = await resend.batch.send(
          chunk.map(({ to, subject, html, text }) => ({ from, to: [to], subject, html, text })),
          { idempotencyKey: `${idempotencyKey}:${start}` },
        );
        if (error) {
          throw new Error(`Resend refused the emails: ${error.message}`, { cause: error });
        }
      }
    },
  };
}

/** For development without a Resend key: says what would have been sent. */
export function createLogMailer(logger: Logger): Mailer {
  return {
    send(messages) {
      for (const { to, subject } of messages) {
        logger.info({ to, subject }, 'Email not sent: RESEND_API_KEY is not set');
      }
      return Promise.resolve();
    },
  };
}

export function createMailer(
  env: Pick<Env, 'RESEND_API_KEY' | 'EMAIL_FROM'>,
  logger: Logger,
): Mailer {
  if (env.RESEND_API_KEY) {
    return createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  }
  return createLogMailer(logger);
}
