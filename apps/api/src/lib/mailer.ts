import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from 'pino';
import { Resend } from 'resend';
import type { Env } from '../config/env.js';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Where replies go, when not to the sender (an autoresponder's form owner, say). */
  replyTo?: string | undefined;
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
          chunk.map(({ to, subject, html, text, replyTo }) => ({
            from,
            to: [to],
            subject,
            html,
            text,
            ...(replyTo && { replyTo }),
          })),
          { idempotencyKey: `${idempotencyKey}:${start}` },
        );
        if (error) {
          throw new Error(`Resend refused the emails: ${error.message}`, { cause: error });
        }
      }
    },
  };
}

/**
 * Without a Resend key: says what would have been sent. With `includeText` (development
 * only) it logs the text too, so links in emails, such as invites, can still be followed.
 */
export function createLogMailer(logger: Logger, { includeText = false } = {}): Mailer {
  return {
    send(messages) {
      for (const { to, subject, text } of messages) {
        logger.info(
          { to, subject, ...(includeText && { text }) },
          'Email not sent: RESEND_API_KEY is not set',
        );
      }
      return Promise.resolve();
    },
  };
}

/**
 * Writes each send to `directory` as a JSON file, then hands it on to `next`. For development
 * and end-to-end tests, which read the files to follow links in emails.
 */
export function createOutboxMailer(directory: string, next: Mailer): Mailer {
  let sequence = 0;
  return {
    async send(messages, options) {
      await mkdir(directory, { recursive: true });
      sequence += 1;
      // Sortable by time; the key is only made safe for a file name.
      const name = `${Date.now()}-${String(sequence).padStart(4, '0')}-${options.idempotencyKey.replace(/[^\w-]+/g, '_')}.json`;
      await writeFile(join(directory, name), JSON.stringify({ messages }, null, 2));
      await next.send(messages, options);
    },
  };
}

export function createMailer(
  env: Pick<Env, 'NODE_ENV' | 'RESEND_API_KEY' | 'EMAIL_FROM' | 'EMAIL_OUTBOX_DIR'>,
  logger: Logger,
): Mailer {
  if (env.RESEND_API_KEY) {
    return createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  }
  const log = createLogMailer(logger, { includeText: env.NODE_ENV === 'development' });
  return env.EMAIL_OUTBOX_DIR && env.NODE_ENV !== 'production'
    ? createOutboxMailer(env.EMAIL_OUTBOX_DIR, log)
    : log;
}
