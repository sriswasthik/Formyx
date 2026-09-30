import { z } from 'zod';
import { formSchema } from './form-schema.js';
import { formTemplateIdSchema } from './templates.js';
import { formThemeSchema } from './theme.js';

export const FORM_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const;
export const formStatusSchema = z.enum(FORM_STATUSES);
export type FormStatus = z.infer<typeof formStatusSchema>;

export const FORM_STATUS_LABELS: Record<FormStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CLOSED: 'Closed',
};

export const FORM_TITLE_MAX_LENGTH = 120;

export const formTitleSchema = z
  .string({ error: 'Enter a title' })
  .trim()
  .min(1, 'Enter a title')
  .max(FORM_TITLE_MAX_LENGTH, `Use ${FORM_TITLE_MAX_LENGTH} characters or fewer`);

/** Body of `POST /api/workspaces/:workspaceId/forms`. */
export const createFormInputSchema = z.object({
  templateId: formTemplateIdSchema.default('blank'),
  /** Defaults to the template's title. */
  title: formTitleSchema.optional(),
});
export type CreateFormInput = z.input<typeof createFormInputSchema>;

/**
 * Body of `PATCH /api/forms/:id`. `version` is the version the edit started from: if the
 * form has changed since, the update is rejected with 409 instead of overwriting.
 */
export const updateFormInputSchema = z
  .object({
    version: z.number({ error: 'Send the version you are editing' }).int().min(1),
    title: formTitleSchema.optional(),
    draftSchema: formSchema.optional(),
  })
  .refine((input) => input.title !== undefined || input.draftSchema !== undefined, {
    message: 'Send a title or a draftSchema to update',
  });
export type UpdateFormInput = z.infer<typeof updateFormInputSchema>;

/** Query string of `GET /api/workspaces/:workspaceId/forms`. Status is case-insensitive. */
export const listFormsQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  status: z
    .string()
    .transform((value) => value.toUpperCase())
    .pipe(formStatusSchema)
    .optional(),
});
export type ListFormsQuery = z.infer<typeof listFormsQuerySchema>;

/** What the dashboard shows for each form. */
export const formSummarySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  slug: z.string(),
  status: formStatusSchema,
  version: z.number().int(),
  responseCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
});
export type FormSummary = z.infer<typeof formSummarySchema>;

export const formListResponseSchema = z.object({ forms: z.array(formSummarySchema) });
export type FormListResponse = z.infer<typeof formListResponseSchema>;

export const formDetailSchema = formSummarySchema.extend({
  draftSchema: formSchema,
  publishedSchema: formSchema.nullable(),
  theme: formThemeSchema,
});
export type FormDetail = z.infer<typeof formDetailSchema>;

/** `details` of the 409 returned when an update was based on an outdated version. */
export const versionConflictDetailsSchema = z.object({ currentVersion: z.number().int() });
