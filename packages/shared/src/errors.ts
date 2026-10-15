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
  /** The form opens later; `details.opensAt` says when. */
  'FORM_NOT_OPEN',
  /** The form has a password: unlock it first, or unlock it again after it changed. */
  'FORM_LOCKED',
  /** The password, or an emailed code, was not right. */
  'WRONG_CODE',
  /** The form takes one response per person, and this person has responded. */
  'ALREADY_RESPONDED',
  /** The form needs the respondent's email address verified first. */
  'VERIFICATION_REQUIRED',
  /** The edit link is unknown, or editing is off or over. */
  'EDIT_UNAVAILABLE',
  /** The draft is not ready to publish; `details` lists what to fix. */
  'FORM_INCOMPLETE',
  /** The invite link was used, revoked or has expired; `details.status` says which. */
  'INVITE_UNAVAILABLE',
  /** The change would leave a workspace without an owner. */
  'LAST_OWNER',
  /** File uploads are not set up on this server. */
  'UPLOADS_UNAVAILABLE',
  /** An integration (Google Sheets, Notion) is not set up on this server. */
  'INTEGRATION_UNAVAILABLE',
  'DRAFTS_OFF',
  /** Switched off for the shared demo account: it would reach outside Formyx or change the workspace. */
  'DEMO_RESTRICTED',
  /** The workspace's plan does not include a feature this needs; `details.features` lists them. */
  'UPGRADE_REQUIRED',
  /** The workspace has as many of something as its plan allows; `details.limit` says what. */
  'LIMIT_REACHED',
  /** Payments are not set up on this server. */
  'BILLING_UNAVAILABLE',
  /** Razorpay could not be reached or refused the request; nothing was charged. */
  'PAYMENT_PROVIDER_ERROR',
  /** Checkout's signature does not match: the payment can't be confirmed from it. */
  'INVALID_SIGNATURE',
  /** The form is held for review or taken offline; the public page says only "unavailable". */
  'FORM_UNAVAILABLE',
  /** Formyx suspended the form: only an admin can bring it back. */
  'FORM_SUSPENDED',
  /** The account is suspended; it can't sign in. */
  'ACCOUNT_SUSPENDED',
  /** Publishing needs a confirmed email address (when REQUIRE_EMAIL_VERIFICATION is on). */
  'EMAIL_NOT_VERIFIED',
  /** Not yet for an account this new; `details.until` says when (`NEW_ACCOUNT_LIMITS`). */
  'NEW_ACCOUNT_LIMIT',
  /** An address is on a list of unsafe sites; `details.urls` lists them. */
  'UNSAFE_LINK',
  /** The form's spam check (Cloudflare Turnstile) did not pass. */
  'CAPTCHA_FAILED',
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
