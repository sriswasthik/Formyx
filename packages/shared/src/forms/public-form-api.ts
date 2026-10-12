import { z } from 'zod';
import { dateFormatSchema, formLanguageSchema, numberFormatSchema } from '../i18n/languages.js';
import { storedFormThemeSchema } from '../theme/migrate.js';
import { formSchemaShape } from './form-schema-shape.js';

// What respondents' browsers read. Kept apart from the builder's form API (api.ts), whose
// schemas run every check on a form schema, so the public form does not download them.

/** The language and formats of a form's own words, for the screens around its questions. */
export const publicLocaleSchema = z.object({
  language: formLanguageSchema,
  dateFormat: dateFormatSchema,
  numberFormat: numberFormatSchema,
});
export type PublicLocale = z.infer<typeof publicLocaleSchema>;

/** What respondents' browsers need to know of the form's access settings. */
export const publicAccessSchema = z.object({
  /** Ask for an email address before the questions, and whether to confirm it with a code. */
  emailStep: z.enum(['none', 'ask', 'verify']),
  /** Remember on this device that it has responded, and say so on the next visit. */
  oneResponsePerBrowser: z.boolean(),
  /** Responses come with a private link to change them. */
  allowEdits: z.boolean(),
  /** Search engines may list it. */
  indexable: z.boolean(),
});
export type PublicAccess = z.infer<typeof publicAccessSchema>;

/** A published form that takes responses: its published snapshot, never the draft. */
export const publicFormSchema = z.object({
  status: z.literal('open'),
  slug: z.string(),
  title: z.string(),
  // Checked on the server when it was published; the browser only reads it.
  schema: formSchemaShape,
  theme: storedFormThemeSchema,
  access: publicAccessSchema,
});
export type PublicForm = z.infer<typeof publicFormSchema>;

/** A form that no longer takes responses: closed, full or past its closing time. */
export const closedPublicFormSchema = z.object({
  status: z.literal('closed'),
  slug: z.string(),
  title: z.string(),
  locale: publicLocaleSchema,
  /** The form's own words for it (rich text), if it has any. */
  message: z.string().optional(),
});
export type ClosedPublicForm = z.infer<typeof closedPublicFormSchema>;

/** A published form whose opening time is still to come. */
export const notOpenPublicFormSchema = z.object({
  status: z.literal('not_open'),
  slug: z.string(),
  title: z.string(),
  locale: publicLocaleSchema,
  opensAt: z.iso.datetime({ offset: true }),
  /** The workspace's time zone, which the opening time is shown in. */
  timeZone: z.string(),
});
export type NotOpenPublicForm = z.infer<typeof notOpenPublicFormSchema>;

/** A form behind a password: only its title and look, until it is unlocked. */
export const lockedPublicFormSchema = z.object({
  status: z.literal('locked'),
  slug: z.string(),
  title: z.string(),
  locale: publicLocaleSchema,
  theme: storedFormThemeSchema,
});
export type LockedPublicForm = z.infer<typeof lockedPublicFormSchema>;

/**
 * What `GET /api/public/forms/:slug` returns. A closed form is an expected state rather than
 * an error, so it comes back as 200 too; forms that were never published are 404.
 */
export const publicFormResponseSchema = z.discriminatedUnion('status', [
  publicFormSchema,
  closedPublicFormSchema,
  notOpenPublicFormSchema,
  lockedPublicFormSchema,
]);
export type PublicFormResponse = z.infer<typeof publicFormResponseSchema>;

/** `details` of the 410 FORM_CLOSED when responding to (or viewing) a closed form. */
export const closedFormDetailsSchema = z.object({ title: z.string() });
export type ClosedFormDetails = z.infer<typeof closedFormDetailsSchema>;
