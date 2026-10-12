import { z } from 'zod';
import { storedFormThemeSchema } from '../theme/migrate.js';
import { formSchemaShape } from './form-schema-shape.js';

// What respondents' browsers read. Kept apart from the builder's form API (api.ts), whose
// schemas run every check on a form schema, so the public form does not download them.

/** A published form that takes responses: its published snapshot, never the draft. */
export const publicFormSchema = z.object({
  status: z.literal('open'),
  slug: z.string(),
  title: z.string(),
  // Checked on the server when it was published; the browser only reads it.
  schema: formSchemaShape,
  theme: storedFormThemeSchema,
});
export type PublicForm = z.infer<typeof publicFormSchema>;

/** A form that no longer takes responses: closed, full or past its closing time. */
export const closedPublicFormSchema = z.object({
  status: z.literal('closed'),
  slug: z.string(),
  title: z.string(),
});
export type ClosedPublicForm = z.infer<typeof closedPublicFormSchema>;

/**
 * What `GET /api/public/forms/:slug` returns. A closed form is an expected state rather than
 * an error, so it comes back as 200 too; forms that were never published are 404.
 */
export const publicFormResponseSchema = z.discriminatedUnion('status', [
  publicFormSchema,
  closedPublicFormSchema,
]);
export type PublicFormResponse = z.infer<typeof publicFormResponseSchema>;

/** `details` of the 410 FORM_CLOSED when responding to (or viewing) a closed form. */
export const closedFormDetailsSchema = z.object({ title: z.string() });
export type ClosedFormDetails = z.infer<typeof closedFormDetailsSchema>;
