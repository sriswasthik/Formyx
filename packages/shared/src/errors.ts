import { z } from 'zod';

/** Machine-readable error codes returned by the API. */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  /** The form is closed, full or past its closing date. */
  'FORM_CLOSED',
  /** The draft is not ready to publish; `details` lists what to fix. */
  'FORM_INCOMPLETE',
  /** The invite link was used, revoked or has expired; `details.status` says which. */
  'INVITE_UNAVAILABLE',
  /** The change would leave a workspace without an owner. */
  'LAST_OWNER',
  /** File uploads are not set up on this server. */
  'UPLOADS_UNAVAILABLE',
  /** Switched off for the shared demo account: it would reach outside Formyx or change the workspace. */
  'DEMO_RESTRICTED',
  /** The workspace's plan does not include a feature this needs; `details.features` lists them. */
  'UPGRADE_REQUIRED',
  /** The workspace has as many of something as its plan allows; `details.limit` says what. */
  'LIMIT_REACHED',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** A single field-level problem, used as `details` for VALIDATION_ERROR. */
export const validationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

/** The one error shape every API endpoint returns: `{ error: { code, message, details? } }`. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export function createApiError(code: ErrorCode, message: string, details?: unknown): ApiErrorBody {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}

export function isApiError(value: unknown): value is ApiErrorBody {
  return apiErrorSchema.safeParse(value).success;
}

/**
 * Flattens Zod issues into `{ path, message }` pairs. Paths use dot notation
 * (`fields.0.label`) so clients can map them straight onto form fields.
 */
export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
