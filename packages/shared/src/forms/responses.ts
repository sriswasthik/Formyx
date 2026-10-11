import { z } from 'zod';
import { matrixAnswerSchema } from './answer-values.js';
import { fileAnswerSchema } from './files.js';
import { NODE_ID_PATTERN } from './ids.js';

/**
 * Reading and managing responses: the submissions a published form has collected. The API
 * calls them submissions; people see them as responses.
 */

export const SUBMISSIONS_PAGE_SIZE = 50;
export const SUBMISSIONS_MAX_PAGE_SIZE = 100;
/** The most responses one bulk delete may remove: two pages' worth. */
export const MAX_BULK_DELETE = 100;

export const SUBMISSION_ORDERS = ['newest', 'oldest'] as const;
export const submissionOrderSchema = z.enum(SUBMISSION_ORDERS);
export type SubmissionOrder = z.infer<typeof submissionOrderSchema>;

/** Query string of `GET /api/forms/:formId/submissions`. */
export const listSubmissionsQuerySchema = z.object({
  /** `nextCursor` from the previous page; leave it out for the first page. */
  cursor: z.string().max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SUBMISSIONS_MAX_PAGE_SIZE)
    .default(SUBMISSIONS_PAGE_SIZE),
  order: submissionOrderSchema.default('newest'),
  /** Matches answers containing the text, and choices whose option label contains it. */
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined),
  /** Only responses that answered this question. */
  answered: z.string().regex(NODE_ID_PATTERN).max(64).optional(),
});
export type ListSubmissionsQuery = z.input<typeof listSubmissionsQuerySchema>;

/**
 * A stored answer: text, a number, `true` for consent, option ids, an uploaded file, an
 * address, a date range or a matrix's rows. (File answers stored before uploads existed are
 * just the file's name.) Objects are tried most specific first; a matrix takes any rows.
 */
export const storedAnswerSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  fileAnswerSchema,
  z.object({
    line1: z.string(),
    line2: z.string().optional(),
    pin: z.string(),
    city: z.string(),
    state: z.string(),
  }),
  z.object({ start: z.string(), end: z.string() }),
  matrixAnswerSchema,
]);

export const submissionMetadataSchema = z.object({
  userAgent: z.string().nullable(),
  referrer: z.string().nullable(),
});
export type SubmissionMetadata = z.infer<typeof submissionMetadataSchema>;

/** One response as the dashboard sees it. */
export const submissionRecordSchema = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  /** How long the respondent spent on the form, if their browser said. */
  completionTimeMs: z.number().int().nullable(),
  /** Answers keyed by field id. Questions left empty are absent. */
  answers: z.record(z.string(), storedAnswerSchema),
  metadata: submissionMetadataSchema,
});
export type SubmissionRecord = z.infer<typeof submissionRecordSchema>;

export const submissionPageSchema = z.object({
  submissions: z.array(submissionRecordSchema),
  /** Pass as `cursor` to get the next page; `null` on the last page. */
  nextCursor: z.string().nullable(),
  /** How many responses match the filters, across all pages. */
  total: z.number().int().min(0),
});
export type SubmissionPage = z.infer<typeof submissionPageSchema>;

/** Body of `POST /api/forms/:formId/submissions/bulk-delete`. */
export const deleteSubmissionsInputSchema = z.object({
  ids: z
    .array(z.string().min(1).max(64))
    .min(1, 'Choose at least one response')
    .max(MAX_BULK_DELETE, `Delete at most ${MAX_BULK_DELETE} responses at a time`),
});
export type DeleteSubmissionsInput = z.infer<typeof deleteSubmissionsInputSchema>;

export const deleteSubmissionsResponseSchema = z.object({ deleted: z.number().int().min(0) });
export type DeleteSubmissionsResponse = z.infer<typeof deleteSubmissionsResponseSchema>;

/**
 * The dashboard page with a form's responses; with `responseId`, the Responses tab with that
 * response open. Shared so the links in emails always match the web app's routes.
 */
export function formResponsesPath(formId: string, { responseId }: { responseId?: string } = {}) {
  const path = `/app/forms/${encodeURIComponent(formId)}/responses`;
  return responseId ? `${path}?tab=responses&response=${encodeURIComponent(responseId)}` : path;
}

/** The signed-in member's own notification settings for one form. */
export const notificationSettingsSchema = z.object({
  /** Email me about each new response. */
  emailOnSubmission: z.boolean(),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
