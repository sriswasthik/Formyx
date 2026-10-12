import { z } from 'zod';
import { EDIT_TOKEN_PATTERN } from './respondent-api.js';
import { storedAnswerSchema } from './responses.js';

// Opening a response again through its private link. Apart from respondent-api.ts so the
// public form loads it only for such links.

/** Body of `POST /api/public/forms/:slug/edit`: the link's token, kept out of URLs. */
export const editLoadInputSchema = z.object({ token: z.string().regex(EDIT_TOKEN_PATTERN) });

/** The answers given, to change. */
export const editLoadResponseSchema = z.object({
  answers: z.record(z.string(), storedAnswerSchema),
  respondentEmail: z.string().nullable(),
});
export type EditLoadResponse = z.infer<typeof editLoadResponseSchema>;
