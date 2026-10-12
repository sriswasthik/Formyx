import { z } from 'zod';

/*
 * Webhooks: Formyx POSTs a JSON event to each of a form's webhook URLs when a response is
 * saved. Each request carries an HMAC-SHA256 signature of its raw body, made with the
 * webhook's secret, so receivers can check it came from Formyx and was not altered.
 */

export const MAX_WEBHOOKS_PER_FORM = 10;
/** Deliveries kept per webhook for its log. */
export const WEBHOOK_LOG_SIZE = 20;

/** `sha256=<hex HMAC-SHA256 of the raw request body, keyed with the webhook's secret>` */
export const WEBHOOK_SIGNATURE_HEADER = 'X-Formyx-Signature';
export const WEBHOOK_EVENT_HEADER = 'X-Formyx-Event';
/** Unique per delivery attempt chain: retries of one event share it. */
export const WEBHOOK_DELIVERY_HEADER = 'X-Formyx-Delivery';

export const WEBHOOK_EVENTS = ['submission.created', 'test'] as const;
export const webhookEventSchema = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export const webhookUrlSchema = z
  .url({ protocol: /^https?$/, error: 'Use a full http(s) URL, such as https://example.com/hooks' })
  .max(2048, 'Use a shorter URL');

/** Body of `POST /api/forms/:formId/webhooks`. */
export const createWebhookInputSchema = z.object({ url: webhookUrlSchema });
export type CreateWebhookInput = z.infer<typeof createWebhookInputSchema>;

export const webhookDeliverySchema = z.object({
  id: z.string(),
  event: webhookEventSchema,
  /** 1 for the first try, up to 4 after three retries. */
  attempt: z.number().int().min(1),
  succeeded: z.boolean(),
  /** The receiver's HTTP status, or `null` if no response came back. */
  statusCode: z.number().int().nullable(),
  durationMs: z.number().int().min(0).nullable(),
  /** Why it failed without a response: timeout, refused connection and so on. */
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

export const webhookSchema = z.object({
  id: z.string(),
  url: z.string(),
  createdAt: z.iso.datetime(),
  lastDelivery: webhookDeliverySchema.nullable(),
});
export type Webhook = z.infer<typeof webhookSchema>;

export const webhooksResponseSchema = z.object({ webhooks: z.array(webhookSchema) });
export type WebhooksResponse = z.infer<typeof webhooksResponseSchema>;

/** The answer to creating a webhook: the only time its secret is shown. */
export const createdWebhookSchema = z.object({ webhook: webhookSchema, secret: z.string() });
export type CreatedWebhook = z.infer<typeof createdWebhookSchema>;

export const webhookDeliveriesSchema = z.object({ deliveries: z.array(webhookDeliverySchema) });
export type WebhookDeliveries = z.infer<typeof webhookDeliveriesSchema>;

/** One answer in an event: the raw value and the text people would read. */
export interface WebhookAnswer {
  fieldId: string;
  label: string;
  type: string;
  value: unknown;
  text: string;
}

/** The JSON body of every webhook request. */
export interface WebhookPayload {
  /** Same as the X-Formyx-Delivery header. */
  id: string;
  event: WebhookEvent;
  /** When the event happened (ISO 8601). Signed with the rest, so receivers can refuse replays. */
  createdAt: string;
  form: { id: string; title: string };
  submission: {
    id: string;
    createdAt: string;
    answers: WebhookAnswer[];
    /** The quiz mark, values and end screen, as the server worked them out. */
    outcome: WebhookOutcome | null;
  };
}

/** A response's outcome in an event: variables by name as well as id. */
export interface WebhookOutcome {
  endScreen: { id: string; name: string };
  variables: { id: string; name: string; value: number }[];
  quiz: { score: number; max: number; percent: number; passed: boolean | null } | null;
}
