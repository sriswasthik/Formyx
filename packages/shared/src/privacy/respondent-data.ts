import { z } from 'zod';

/*
 * A respondent asks a creator for their data, or for it to be deleted. The creator looks
 * them up by email address across the workspace's forms: the address they gave before the
 * questions, or an answer to an email question.
 */

/** Query of `GET /api/workspaces/:id/respondent-data`, and body of its `DELETE`. */
export const respondentLookupInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email('Enter the respondent’s email address')),
});
export type RespondentLookupInput = z.infer<typeof respondentLookupInputSchema>;

/** One response that holds the address. */
export const respondentMatchSchema = z.object({
  submissionId: z.string(),
  formId: z.string(),
  formTitle: z.string(),
  createdAt: z.iso.datetime(),
  /** Found through the address asked before the questions, or an email question's answer. */
  matchedBy: z.enum(['respondent_email', 'answer']),
});
export type RespondentMatch = z.infer<typeof respondentMatchSchema>;

/** Most responses one lookup shows; deleting takes them all, however many. */
export const RESPONDENT_LOOKUP_LIMIT = 200;

export const respondentLookupResponseSchema = z.object({
  matches: z.array(respondentMatchSchema),
  /** Every match, even beyond the ones listed. */
  total: z.number().int(),
});
export type RespondentLookupResponse = z.infer<typeof respondentLookupResponseSchema>;

export const respondentDeleteResponseSchema = z.object({ deleted: z.number().int() });
export type RespondentDeleteResponse = z.infer<typeof respondentDeleteResponseSchema>;
