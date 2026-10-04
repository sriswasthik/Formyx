import {
  storedFormSchemaSchema,
  MAX_WEBHOOKS_PER_FORM,
  WEBHOOK_LOG_SIZE,
  type CreatedWebhook,
  type FormSchema,
  type Webhook,
  type WebhookDelivery,
} from '@formyx/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
import { newWebhookSecret, type SecretBox } from '../lib/webhook-signature.js';
import { deliverySelect, toDelivery, type DeliveryRecord } from '../webhooks/dispatcher.js';

export interface WebhookService {
  /** The form's webhooks, oldest first, each with its latest delivery. */
  list(formId: string): Promise<Webhook[]>;
  /** Adds a webhook with a new secret, returned this once. */
  create(formId: string, userId: string, url: string): Promise<CreatedWebhook>;
  remove(formId: string, webhookId: string): Promise<void>;
  /** The newest deliveries first. 404 if the webhook is not the form's. */
  deliveries(formId: string, webhookId: string): Promise<WebhookDelivery[]>;
  /** What a test event is about: the form's title and questions. 404 for unknown webhooks. */
  testSubject(
    formId: string,
    webhookId: string,
  ): Promise<{ id: string; title: string; schema: FormSchema | null }>;
}

function webhookNotFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Webhook not found');
}

const webhookSelect = {
  id: true,
  url: true,
  createdAt: true,
  deliveries: {
    select: deliverySelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
  },
} satisfies Prisma.WebhookSelect;

function toWebhook(row: {
  id: string;
  url: string;
  createdAt: Date;
  deliveries: DeliveryRecord[];
}): Webhook {
  const [last] = row.deliveries;
  return {
    id: row.id,
    url: row.url,
    createdAt: row.createdAt.toISOString(),
    lastDelivery: last ? toDelivery(last) : null,
  };
}

export function createWebhookService(prisma: Database, secrets: SecretBox): WebhookService {
  async function assertWebhook(formId: string, webhookId: string) {
    const found = await prisma.webhook.count({ where: { id: webhookId, formId } });
    if (found === 0) throw webhookNotFound();
  }

  return {
    async list(formId) {
      const rows = await prisma.webhook.findMany({
        where: { formId },
        select: webhookSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return rows.map(toWebhook);
    },

    async create(formId, userId, url) {
      const count = await prisma.webhook.count({ where: { formId } });
      if (count >= MAX_WEBHOOKS_PER_FORM) {
        throw new AppError(
          409,
          'CONFLICT',
          `A form can have up to ${MAX_WEBHOOKS_PER_FORM} webhooks. Remove one first.`,
        );
      }
      const secret = newWebhookSecret();
      const row = await prisma.webhook.create({
        data: { formId, url, createdById: userId, secretEncrypted: secrets.encrypt(secret) },
        select: webhookSelect,
      });
      return { webhook: toWebhook(row), secret };
    },

    async remove(formId, webhookId) {
      const { count } = await prisma.webhook.deleteMany({ where: { id: webhookId, formId } });
      if (count === 0) throw webhookNotFound();
    },

    async deliveries(formId, webhookId) {
      await assertWebhook(formId, webhookId);
      const rows = await prisma.webhookDelivery.findMany({
        where: { webhookId },
        select: deliverySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: WEBHOOK_LOG_SIZE,
      });
      return rows.map(toDelivery);
    },

    async testSubject(formId, webhookId) {
      await assertWebhook(formId, webhookId);
      const form = await prisma.form.findUniqueOrThrow({
        where: { id: formId },
        select: { title: true, publishedTitle: true, publishedSchema: true, draftSchema: true },
      });
      // Before the first publish, the draft's questions are the best example there is.
      const schema = storedFormSchemaSchema.safeParse(
        form.publishedSchema ?? form.draftSchema,
      ).data;
      return { id: formId, title: form.publishedTitle ?? form.title, schema: schema ?? null };
    },
  };
}
