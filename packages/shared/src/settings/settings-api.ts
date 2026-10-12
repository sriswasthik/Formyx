import { z } from 'zod';
import { FORM_PASSWORD_MAX_LENGTH, FORM_PASSWORD_MIN_LENGTH } from './access.js';
import {
  accessSettingsSchema,
  autoresponderSchema,
  dataSettingsSchema,
  liveSettingsSchema,
  formNotificationSettingsSchema,
  sharingSettingsSchema,
} from './live-settings.js';
import { CHAT_SERVICES, chatWebhookProblem, customSlugSchema } from './sharing-rules.js';

/** A chat webhook as editors see it: whether one is set, and the end of its URL. */
export const chatWebhookViewSchema = z.object({ hint: z.string() }).nullable();

/** `GET /api/forms/:formId/settings`: the live settings, with secrets only as set or not. */
export const formSettingsViewSchema = z.object({
  settings: liveSettingsSchema,
  slug: z.string(),
  hasPassword: z.boolean(),
  chat: z.object({ slack: chatWebhookViewSchema, discord: chatWebhookViewSchema }),
});
export type FormSettingsView = z.infer<typeof formSettingsViewSchema>;

/**
 * Body of `PATCH /api/forms/:formId/settings`: any sections, each replaced whole. Editors
 * save as they go, a section at a time, so two people changing different sections never
 * undo each other.
 */
export const updateFormSettingsInputSchema = z
  .object({
    access: accessSettingsSchema.optional(),
    notifications: formNotificationSettingsSchema.optional(),
    autoresponder: autoresponderSchema.optional(),
    sharing: sharingSettingsSchema.optional(),
    data: dataSettingsSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Send at least one section',
  });
export type UpdateFormSettingsInput = z.infer<typeof updateFormSettingsInputSchema>;

/** Body of `PUT /api/forms/:formId/settings/password`; `null` removes the password. */
export const formPasswordInputSchema = z.object({
  password: z
    .string({ error: 'Enter a password' })
    .min(FORM_PASSWORD_MIN_LENGTH, `Use at least ${FORM_PASSWORD_MIN_LENGTH} characters`)
    .max(FORM_PASSWORD_MAX_LENGTH, `Use ${FORM_PASSWORD_MAX_LENGTH} characters or fewer`)
    .nullable(),
});
export type FormPasswordInput = z.infer<typeof formPasswordInputSchema>;

/** Body of `PUT /api/forms/:formId/settings/chat`; a `null` URL removes the webhook. */
export const chatWebhookInputSchema = z
  .object({ service: z.enum(CHAT_SERVICES), url: z.string().trim().max(512).nullable() })
  .superRefine((input, ctx) => {
    if (input.url === null) return;
    const problem = chatWebhookProblem(input.service, input.url);
    if (problem) ctx.addIssue({ code: 'custom', path: ['url'], message: problem });
  });
export type ChatWebhookInput = z.infer<typeof chatWebhookInputSchema>;

/** Body of `POST /api/forms/:formId/settings/chat/test`. */
export const chatTestInputSchema = z.object({ service: z.enum(CHAT_SERVICES) });

/** Body of `PUT /api/forms/:formId/slug`. Old addresses keep working. */
export const changeSlugInputSchema = z.object({ slug: customSlugSchema });
export type ChangeSlugInput = z.infer<typeof changeSlugInputSchema>;

/** Body of `POST /api/forms/:formId/submissions/delete-all`: the form's title, typed out. */
export const deleteAllResponsesInputSchema = z.object({ confirm: z.string() });

/** Reply to deleting all responses. */
export const deleteAllResponsesResponseSchema = z.object({ deleted: z.number().int().min(0) });
export type DeleteAllResponsesResponse = z.infer<typeof deleteAllResponsesResponseSchema>;

/** Body of `POST /api/forms/:formId/settings/autoresponder/test`: sent to the caller. */
export const autoresponderTestInputSchema = z.object({ autoresponder: autoresponderSchema });

/**
 * `GET /api/public/forms/:slug/meta`: what a published form's page says before any script
 * runs, for link previews and search engines. `slug` is the form's current address.
 */
export const formMetaSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  imageUrl: z.string(),
  faviconUrl: z.string().optional(),
  indexable: z.boolean(),
});
export type FormMeta = z.infer<typeof formMetaSchema>;
