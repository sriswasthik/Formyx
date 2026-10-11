import { z } from 'zod';
import { NODE_ID_PATTERN } from './ids.js';
import { storedAnswerSchema } from './responses.js';
import { submissionAnswersSchema } from './submission.js';

/*
 * What respondents' browsers and the API exchange beyond the form and its answers: progress
 * for drop-off analytics, the outcome of a response, and drafts saved to finish later.
 */

const nodeId = z.string().regex(NODE_ID_PATTERN);

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
  pageKey: nodeId.optional(),
  fieldId: nodeId.optional(),
});
export type ProgressInput = z.infer<typeof progressInputSchema>;

/** Where a respondent was, to carry on from there. */
export const draftStateSchema = z.object({
  pageKey: nodeId.optional(),
  /** Their shuffle seed, so questions and options keep their order. */
  seed: z.string().max(32).optional(),
});
export type DraftState = z.infer<typeof draftStateSchema>;

/** Body of `POST /api/public/forms/:slug/drafts`: save the answers and email a link. */
export const saveDraftInputSchema = z.object({
  email: z.email('Enter an email address').max(254),
  answers: submissionAnswersSchema,
  state: draftStateSchema,
});
export type SaveDraftInput = z.input<typeof saveDraftInputSchema>;

/** 32 random bytes, base64url. Only its hash is stored. */
export const DRAFT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Body of `POST /api/public/forms/:slug/drafts/resume`. The token stays out of URLs. */
export const resumeDraftInputSchema = z.object({ token: z.string().regex(DRAFT_TOKEN_PATTERN) });

export const draftResponseSchema = z.object({
  answers: z.record(z.string(), storedAnswerSchema),
  state: draftStateSchema,
});
export type DraftResponse = z.infer<typeof draftResponseSchema>;

/** How long a saved draft lasts. */
export const DRAFT_LIFETIME_DAYS = 30;
