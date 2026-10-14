import { z } from 'zod';
import { validationIssueSchema } from '../errors.js';
import { storedFormThemeSchema } from '../theme/migrate.js';
import { formSchema } from './form-schema.js';
import { formTemplateIdSchema } from './template-ids.js';

export const FORM_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const;
export const formStatusSchema = z.enum(FORM_STATUSES);
export type FormStatus = z.infer<typeof formStatusSchema>;

export const FORM_STATUS_LABELS: Record<FormStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CLOSED: 'Closed',
};

export const FORM_TITLE_MAX_LENGTH = 120;

const COPY_SUFFIX = ' (copy)';

/** Title of a duplicated form: "Survey" -> "Survey (copy)", shortened so it still fits. */
export function copyFormTitle(title: string): string {
  return `${title.slice(0, FORM_TITLE_MAX_LENGTH - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`;
}

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
    /** v2; v1 themes from clients older than v2 are still taken, and upgraded. */
    theme: storedFormThemeSchema.optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined || input.draftSchema !== undefined || input.theme !== undefined,
    { message: 'Send a title, draftSchema or theme to update' },
  );
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

/** A form in the dashboard's list: its summary, its look and how it is doing today. */
export const formListItemSchema = formSummarySchema.extend({
  /** The draft's theme, for the form's thumbnail and colour. */
  theme: storedFormThemeSchema,
  /** Responses since midnight in the workspace's time zone. */
  responsesToday: z.number().int().min(0),
});
export type FormListItem = z.infer<typeof formListItemSchema>;

export const formListResponseSchema = z.object({
  forms: z.array(formListItemSchema),
  /** Responses to all of the workspace's forms in its current usage period (a month). */
  responsesThisMonth: z.number().int().min(0),
});
export type FormListResponse = z.infer<typeof formListResponseSchema>;

export const formDetailSchema = formSummarySchema.extend({
  draftSchema: formSchema,
  /** The snapshot respondents see, taken when the form was last published. */
  publishedSchema: formSchema.nullable(),
  /** The title as it was last published; renames go live with the next publish. */
  publishedTitle: z.string().nullable(),
  /** The look being edited. */
  theme: storedFormThemeSchema,
  /** The look respondents see, as it was last published. */
  publishedTheme: storedFormThemeSchema.nullable(),
});
export type FormDetail = z.infer<typeof formDetailSchema>;

/** `details` of the 409 returned when an update was based on an outdated version. */
export const versionConflictDetailsSchema = z.object({ currentVersion: z.number().int() });

/**
 * Body of `POST /api/forms/:id/publish`: the version of the draft being published. If the
 * draft has changed since, publishing is refused with 409 rather than going live unseen.
 */
export const publishFormInputSchema = z.object({
  version: z.number({ error: 'Send the version you are publishing' }).int().min(1),
});
export type PublishFormInput = z.infer<typeof publishFormInputSchema>;

/** `details` of the 422 FORM_INCOMPLETE returned when a draft is not ready to publish. */
export const formIncompleteDetailsSchema = z.array(validationIssueSchema);
