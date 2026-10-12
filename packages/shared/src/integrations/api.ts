import { z } from 'zod';
import { CHAT_SERVICES } from '../settings/sharing-rules.js';

/*
 * The Integrations page: where each form's responses go besides Formyx (Google Sheets,
 * Notion, Slack, Discord, webhooks), how each is doing, and the jobs that failed.
 */

export const INTEGRATION_KINDS = ['google_sheets', 'notion'] as const;
export const integrationKindSchema = z.enum(INTEGRATION_KINDS);
export type IntegrationKind = z.infer<typeof integrationKindSchema>;

export const INTEGRATION_NAMES: Record<IntegrationKind, string> = {
  google_sheets: 'Google Sheets',
  notion: 'Notion',
};

/**
 * `connecting`: making the sheet or database and copying responses so far. `needs_reconnect`:
 * the account's access ended (revoked, or its owner left). `error`: writes keep failing and
 * are being retried.
 */
export const INTEGRATION_STATUSES = [
  'connecting',
  'active',
  'paused',
  'error',
  'needs_reconnect',
] as const;
export const integrationStatusSchema = z.enum(INTEGRATION_STATUSES);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

const isoDate = z.iso.datetime({ offset: true });

export const integrationViewSchema = z.object({
  id: z.string(),
  kind: integrationKindSchema,
  status: integrationStatusSchema,
  /** The account it writes as ("ada@example.com", or a Notion workspace's name). */
  accountLabel: z.string().nullable(),
  /** Who connected it, when they are still a member. */
  connectedBy: z.string().nullable(),
  /** The sheet or database responses go to, once made. */
  target: z.object({ name: z.string(), url: z.url() }).nullable(),
  lastSyncedAt: isoDate.nullable(),
  lastError: z.string().nullable(),
  lastErrorAt: isoDate.nullable(),
  createdAt: isoDate,
});
export type IntegrationView = z.infer<typeof integrationViewSchema>;

export const jobFailureViewSchema = z.object({
  id: z.string(),
  /** The kind of job, e.g. "webhook.deliver". */
  queue: z.string(),
  integrationId: z.string().nullable(),
  webhookId: z.string().nullable(),
  summary: z.string(),
  error: z.string(),
  attempts: z.number().int(),
  createdAt: isoDate,
});
export type JobFailureView = z.infer<typeof jobFailureViewSchema>;

export const webhookStatusSchema = z.object({
  id: z.string(),
  url: z.string(),
  /** The newest attempt, if any. */
  lastDelivery: z
    .object({
      succeeded: z.boolean(),
      statusCode: z.number().int().nullable(),
      createdAt: isoDate,
    })
    .nullable(),
});
export type WebhookStatus = z.infer<typeof webhookStatusSchema>;

/** `GET /api/forms/:formId/integrations`. */
export const integrationsOverviewSchema = z.object({
  integrations: z.array(integrationViewSchema),
  /** Which kinds this server can connect (their OAuth apps are set up). */
  available: z.record(integrationKindSchema, z.boolean()),
  chat: z.record(z.enum(CHAT_SERVICES), z.object({ hint: z.string() }).nullable()),
  webhooks: z.array(webhookStatusSchema),
  failures: z.array(jobFailureViewSchema),
});
export type IntegrationsOverview = z.infer<typeof integrationsOverviewSchema>;

/** `POST /api/forms/:formId/integrations/:kind/connect`: where to send the browser. */
export const connectIntegrationResponseSchema = z.object({ authorizeUrl: z.url() });
export type ConnectIntegrationResponse = z.infer<typeof connectIntegrationResponseSchema>;

/** `PATCH /api/forms/:formId/integrations/:integrationId`. */
export const updateIntegrationInputSchema = z.object({ paused: z.boolean() });
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationInputSchema>;

/** What the OAuth callback tells the Integrations page, in its query string. */
export const CONNECT_RESULT_PARAM = 'connected';
export const CONNECT_ERROR_PARAM = 'connect_error';
