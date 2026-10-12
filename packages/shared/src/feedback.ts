import { z } from 'zod';

/** What feedback is about, in the order the dialog offers them. */
export const FEEDBACK_KINDS = ['idea', 'problem', 'other'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  idea: 'An idea',
  problem: 'A problem',
  other: 'Something else',
};

export const FEEDBACK_MAX_LENGTH = 2000;

/** Body of `POST /api/feedback`. */
export const feedbackInputSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS, { error: 'Choose what it is about' }),
  message: z
    .string()
    .trim()
    .min(1, 'Write a few words')
    .max(FEEDBACK_MAX_LENGTH, `Keep it under ${FEEDBACK_MAX_LENGTH} characters`),
  /**
   * The app page it was sent from, as a path: anything after `?` or `#` is dropped, since a
   * form's links can carry answers or tokens.
   */
  page: z
    .string()
    .max(200)
    .regex(/^\/[^\s]*$/, 'Must be a path')
    .transform((path) => path.split(/[?#]/)[0] ?? path)
    .optional(),
});
export type FeedbackInput = z.input<typeof feedbackInputSchema>;
