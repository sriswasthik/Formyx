import { z } from 'zod';
import { NODE_ID_PATTERN } from './ids.js';

/*
 * What respondents' browsers and the API exchange beyond the form and its answers: visits
 * and progress for drop-off analytics. Drafts saved to finish later are in draft-api.ts.
 */

export const nodeIdSchema = z.string().regex(NODE_ID_PATTERN);

/** An anonymous, random token for one visit; it ties progress to the visit, nothing more. */
export const VIEW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

/** Reply to `POST /api/public/forms/:slug/view`. */
export const viewResponseSchema = z.object({ token: z.string() });
export type ViewResponse = z.infer<typeof viewResponseSchema>;

/**
 * Body of `POST /api/public/forms/:slug/progress`: how far the visit got, as the page shown
 * and the last question answered. Only ever moves forward.
 */
export const progressInputSchema = z.object({
  token: z.string().regex(VIEW_TOKEN_PATTERN),
  pageKey: nodeIdSchema.optional(),
  fieldId: nodeIdSchema.optional(),
});
export type ProgressInput = z.infer<typeof progressInputSchema>;

/** 32 random bytes, base64url. Only its hash is stored. */
export const DRAFT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Unlocking a form with a password returns a token the browser sends with every request
 * for the form, in this header (not a cookie: embedded forms are third-party frames, where
 * browsers block cookies).
 */
export const FORM_ACCESS_HEADER = 'X-Form-Access';

/** Body of `POST /api/public/forms/:slug/unlock`. */
export const unlockInputSchema = z.object({
  password: z.string({ error: 'Enter the password' }).min(1, 'Enter the password').max(200),
});
export type UnlockInput = z.infer<typeof unlockInputSchema>;

/** Reply to unlocking a form, or to confirming an email address. */
export const accessTokenResponseSchema = z.object({ token: z.string() });
export type AccessTokenResponse = z.infer<typeof accessTokenResponseSchema>;

/** Body of `POST /api/public/forms/:slug/verify`: email a code to this address. */
export const verificationStartInputSchema = z.object({
  email: z.email('Enter an email address').max(254),
});
export type VerificationStartInput = z.infer<typeof verificationStartInputSchema>;

export const VERIFICATION_CODE_PATTERN = /^\d{6}$/;

/** Body of `POST /api/public/forms/:slug/verify/check`. */
export const verificationCheckInputSchema = z.object({
  email: z.email('Enter an email address').max(254),
  code: z.string().trim().regex(VERIFICATION_CODE_PATTERN, 'Enter the 6-digit code'),
});
export type VerificationCheckInput = z.infer<typeof verificationCheckInputSchema>;

/** 32 random bytes, base64url: the token of a link to change a response. */
export const EDIT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
