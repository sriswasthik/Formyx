import {
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_LOG_SIZE,
  WEBHOOK_SIGNATURE_HEADER,
  webhookEventSchema,
  type WebhookDelivery,
  type WebhookPayload,
} from '@formyx/shared';
import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { Database } from '../lib/prisma.js';
import { PermanentJobError } from '../jobs/queue.js';
import { encryptionFromEnv, type Encryption } from '../lib/encryption.js';
import { signWebhookBody } from '../lib/webhook-signature.js';
import {
  createWebhookTransport,
  DeliveryError,
  type WebhookTransport,
} from '../lib/webhook-transport.js';

/*
 * Delivers webhook events: one signed POST per attempt, each logged for the webhook's
 * delivery log. Retries are the job queue's (see jobs/queue.ts): a failed attempt throws, and
 * the queue tries again later with backoff, sending exactly the same signed body. Jobs live in
 * Postgres, so retries survive restarts and are shared between API instances.
 */

export interface WebhookDispatcher {
  /** Sends once, now, without retries, and returns the logged attempt ("Send test event"). */
  sendNow(webhookId: string, payload: WebhookPayload): Promise<WebhookDelivery | null>;
  /** One attempt of a queued delivery; throws when it should be tried again. */
  deliver(job: DeliveryJob): Promise<void>;
}

interface DispatcherOptions {
  prisma: Database;
  logger: Logger;
  secrets: Encryption;
  transport: WebhookTransport;
}

export interface DeliveryJob {
  webhookId: string;
  payload: WebhookPayload;
  /** Serialised once, so every attempt sends (and signs) exactly the same bytes. */
  body: string;
  attempt: number;
}

/** A delivery row as `deliverySelect` reads it. */
export type DeliveryRecord = Omit<WebhookDelivery, 'event' | 'createdAt'> & {
  event: string;
  createdAt: Date;
};

export function toDelivery(record: DeliveryRecord): WebhookDelivery {
  return {
    ...record,
    event: webhookEventSchema.catch('submission.created').parse(record.event),
    createdAt: record.createdAt.toISOString(),
  };
}

export const deliverySelect = {
  id: true,
  event: true,
  attempt: true,
  succeeded: true,
  statusCode: true,
  durationMs: true,
  error: true,
  createdAt: true,
} as const;

export function createWebhookDispatcher({
  prisma,
  logger,
  secrets,
  transport,
}: DispatcherOptions): WebhookDispatcher {
  /** Keeps the newest deliveries of a webhook for its log and drops the rest. */
  async function trimLog(webhookId: string) {
    await prisma.$executeRaw`
      DELETE FROM webhook_deliveries
      WHERE webhook_id = ${webhookId} AND id NOT IN (
        SELECT id FROM webhook_deliveries
        WHERE webhook_id = ${webhookId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${WEBHOOK_LOG_SIZE}
      )
    `;
  }

  /**
   * Sends one attempt and logs it. Returns the logged delivery and whether trying again
   * could help; `null` when the webhook no longer exists.
   */
  async function attempt(
    job: DeliveryJob,
  ): Promise<{ delivery: WebhookDelivery; retry: boolean } | null> {
    const webhook = await prisma.webhook.findUnique({
      where: { id: job.webhookId },
      select: { url: true, secretEncrypted: true },
    });
    if (!webhook) return null;

    let statusCode: number | null = null;
    let error: string | null = null;
    let durationMs: number | null = null;
    let retry = true;
    let secret: string | null = null;
    try {
      secret = secrets.decrypt(webhook.secretEncrypted);
      // Sealed under an older key: store it under the current one.
      if (secrets.needsReseal(webhook.secretEncrypted)) {
        await prisma.webhook.update({
          where: { id: job.webhookId },
          data: { secretEncrypted: secrets.encrypt(secret) },
        });
      }
    } catch {
      error = 'The signing secret can’t be read. Remove the webhook and add it again.';
      retry = false;
    }

    if (secret !== null) {
      const started = performance.now();
      try {
        ({ statusCode } = await transport({
          url: webhook.url,
          body: job.body,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Formyx-Webhooks/1.0',
            [WEBHOOK_EVENT_HEADER]: job.payload.event,
            [WEBHOOK_DELIVERY_HEADER]: job.payload.id,
            [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(job.body, secret),
          },
        }));
      } catch (caught) {
        error = caught instanceof DeliveryError ? caught.message : 'Could not send the request';
      }
      durationMs = Math.round(performance.now() - started);
    }

    const succeeded = statusCode !== null && statusCode >= 200 && statusCode < 300;
    const record = await prisma.webhookDelivery.create({
      data: {
        webhookId: job.webhookId,
        eventId: job.payload.id,
        event: job.payload.event,
        attempt: job.attempt,
        succeeded,
        statusCode,
        durationMs,
        error,
      },
      select: deliverySelect,
    });
    await trimLog(job.webhookId);

    // Addresses can hold secrets (chat webhooks put tokens in them): ids only in logs.
    const context = { webhookId: job.webhookId, eventId: job.payload.id, attempt: job.attempt };
    if (succeeded) logger.info({ ...context, statusCode }, 'Webhook delivered');
    else logger.warn({ ...context, statusCode, error }, 'Webhook delivery failed');

    return { delivery: toDelivery(record), retry: retry && !succeeded };
  }

  return {
    async sendNow(webhookId, payload) {
      const result = await attempt({
        webhookId,
        payload,
        body: JSON.stringify(payload),
        attempt: 1,
      });
      return result?.delivery ?? null;
    },

    async deliver(job) {
      const result = await attempt(job);
      // Removed meanwhile: nothing left to deliver to.
      if (!result || result.delivery.succeeded) return;
      const { statusCode, error } = result.delivery;
      const reason = error ?? `The webhook answered ${statusCode ?? 'nothing'}`;
      throw result.retry ? new Error(reason) : new PermanentJobError(reason);
    },
  };
}

/** The dispatcher the API runs with, from its settings. */
export function createDefaultWebhookDispatcher({
  env,
  prisma,
  logger,
}: {
  env: Pick<Env, 'JWT_SECRET' | 'ENCRYPTION_KEYS' | 'WEBHOOK_ALLOW_PRIVATE_URLS'>;
  prisma: Database;
  logger: Logger;
}): WebhookDispatcher {
  return createWebhookDispatcher({
    prisma,
    logger,
    secrets: encryptionFromEnv(env),
    transport: createWebhookTransport({ allowPrivate: env.WEBHOOK_ALLOW_PRIVATE_URLS }),
  });
}
