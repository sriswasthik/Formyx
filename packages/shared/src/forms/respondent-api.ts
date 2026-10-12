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
