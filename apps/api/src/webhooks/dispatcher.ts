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
import { createSecretBox, signWebhookBody, type SecretBox } from '../lib/webhook-signature.js';
import {
  createWebhookTransport,
  DeliveryError,
  type WebhookTransport,
} from '../lib/webhook-transport.js';

/*
 * Delivers webhook events from an in-process queue, retrying failures with exponential
 * backoff.
 *
 * LIMITATION: the queue lives in this process's memory. Events waiting for a retry are lost
 * if the API restarts, and running several API instances means each retries only what it
 * sent itself. A durable queue (a jobs table, or Redis with BullMQ) would fix both; the
 * dispatcher's interface would stay the same.
 */

/** Waits before each retry: three retries, doubling each time. */
export const RETRY_DELAYS_MS: readonly number[] = [2_000, 4_000, 8_000];
/** Requests in flight at once, across all webhooks. */
const CONCURRENCY = 4;

export interface WebhookDispatcher {
  /** Queues `payload` for one webhook. It is sent soon and retried in the background. */
  enqueue(webhookId: string, payload: WebhookPayload): void;
  /** Sends once, now, without retries, and returns the logged attempt ("Send test event"). */
  sendNow(webhookId: string, payload: WebhookPayload): Promise<WebhookDelivery | null>;
  /** Resolves once nothing is queued, waiting to retry or in flight. */
  idle(): Promise<void>;
  /** Drops pending retries (shutdown). Requests already in flight finish. */
  close(): void;
}

interface DispatcherOptions {
  prisma: Database;
  logger: Logger;
  secrets: SecretBox;
  transport: WebhookTransport;
  retryDelaysMs?: readonly number[];
}

interface Job {
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
  retryDelaysMs = RETRY_DELAYS_MS,
}: DispatcherOptions): WebhookDispatcher {
  const queue: Job[] = [];
  const timers = new Set<NodeJS.Timeout>();
  let active = 0;
  /** Jobs that are queued, in flight or waiting for a retry. */
  let pending = 0;
  let closed = false;
  let idleWaiters: (() => void)[] = [];

  function settle() {
    pending -= 1;
    if (pending === 0) {
      for (const resolve of idleWaiters) resolve();
      idleWaiters = [];
    }
  }

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
  async function attempt(job: Job): Promise<{ delivery: WebhookDelivery; retry: boolean } | null> {
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

  async function run(job: Job) {
    let next: Job | null = null;
    try {
      const result = await attempt(job);
      const delay = retryDelaysMs[job.attempt - 1];
      if (result?.retry && delay !== undefined && !closed) {
        next = { ...job, attempt: job.attempt + 1 };
        const retryJob = next;
        const timer = setTimeout(() => {
          timers.delete(timer);
          queue.push(retryJob);
          pump();
        }, delay);
        timers.add(timer);
      }
    } catch (error) {
      logger.error({ err: error, webhookId: job.webhookId }, 'Webhook delivery crashed');
    } finally {
      active -= 1;
      // A retry stays pending until it, too, is done.
      if (!next) settle();
      pump();
    }
  }

  function pump() {
    while (active < CONCURRENCY && queue.length > 0) {
      const job = queue.shift();
      if (!job) break;
      active += 1;
      void run(job);
    }
  }

  return {
    enqueue(webhookId, payload) {
      if (closed) return;
      pending += 1;
      queue.push({ webhookId, payload, body: JSON.stringify(payload), attempt: 1 });
      pump();
    },

    async sendNow(webhookId, payload) {
      const result = await attempt({
        webhookId,
        payload,
        body: JSON.stringify(payload),
        attempt: 1,
      });
      return result?.delivery ?? null;
    },

    idle() {
      if (pending === 0) return Promise.resolve();
      return new Promise((resolve) => {
        idleWaiters.push(resolve);
      });
    },

    close() {
      closed = true;
      for (const timer of timers) {
        clearTimeout(timer);
        settle();
      }
      timers.clear();
    },
  };
}

/** The dispatcher the API runs with, from its settings. */
export function createDefaultWebhookDispatcher({
  env,
  prisma,
  logger,
  retryDelaysMs,
}: {
  env: Pick<Env, 'JWT_SECRET' | 'WEBHOOK_ALLOW_PRIVATE_URLS'>;
  prisma: Database;
  logger: Logger;
  retryDelaysMs?: readonly number[];
}): WebhookDispatcher {
  return createWebhookDispatcher({
    prisma,
    logger,
    secrets: createSecretBox(env.JWT_SECRET),
    transport: createWebhookTransport({ allowPrivate: env.WEBHOOK_ALLOW_PRIVATE_URLS }),
    ...(retryDelaysMs && { retryDelaysMs }),
  });
}
