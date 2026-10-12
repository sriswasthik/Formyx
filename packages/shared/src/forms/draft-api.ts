import { z } from 'zod';
import { DRAFT_TOKEN_PATTERN, nodeIdSchema } from './respondent-api.js';
import { storedAnswerSchema } from './responses.js';
import { submissionAnswersSchema } from './submission.js';

// Drafts saved to finish later. Apart from respondent-api.ts so the public form loads these
// only when a respondent saves or opens a link to carry on.

/** Where a respondent was, to carry on from there. */
export const draftStateSchema = z.object({
  pageKey: nodeIdSchema.optional(),
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

/** Body of `POST /api/public/forms/:slug/drafts/resume`. The token stays out of URLs. */
export const resumeDraftInputSchema = z.object({ token: z.string().regex(DRAFT_TOKEN_PATTERN) });

export const draftResponseSchema = z.object({
  answers: z.record(z.string(), storedAnswerSchema),
  state: draftStateSchema,
});
export type DraftResponse = z.infer<typeof draftResponseSchema>;

/** How long a saved draft lasts. */
export const DRAFT_LIFETIME_DAYS = 30;
