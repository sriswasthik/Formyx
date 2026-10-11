import { z } from 'zod';

/** The quiz as marked by the server. `review` only when the form reveals the answers. */
export const quizOutcomeSchema = z.object({
  score: z.number(),
  max: z.number(),
  percent: z.number(),
  passed: z.boolean().nullable(),
  review: z
    .array(
      z.object({
        fieldId: z.string(),
        correct: z.boolean(),
        answered: z.boolean(),
        points: z.number(),
        /** Option ids, or the accepted texts and numbers. */
        expected: z.array(z.string()),
      }),
    )
    .optional(),
});
export type QuizOutcome = z.infer<typeof quizOutcomeSchema>;

/** Where a response ended up, as the server worked it out. */
export const submissionOutcomeSchema = z.object({
  endScreenId: z.string(),
  /** Variables, and `quiz_score` and `quiz_percent` when there is a quiz. */
  values: z.record(z.string(), z.number()),
  quiz: quizOutcomeSchema.nullable(),
});
export type SubmissionOutcome = z.infer<typeof submissionOutcomeSchema>;
