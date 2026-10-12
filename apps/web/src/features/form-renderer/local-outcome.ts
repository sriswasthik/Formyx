import {
  computeOutcome,
  type FormSchema,
  type SubmissionOutcome,
  type SubmittedAnswers,
} from '@formyx/shared';

/**
 * The outcome worked out in the browser, where the server is not asked (the editor's
 * preview, which knows the quiz answers). Loaded only then, so public forms, whose outcome
 * the server sends, do not download the quiz marking.
 */
export function localOutcome(schema: FormSchema, answers: SubmittedAnswers): SubmissionOutcome {
  const outcome = computeOutcome(schema, answers);
  const { quiz } = outcome;
  return {
    endScreenId: outcome.endScreenId,
    values: outcome.values,
    quiz: quiz && {
      score: quiz.score,
      max: quiz.max,
      percent: quiz.percent,
      passed: quiz.passed,
      ...(schema.logic.quiz?.revealAnswers && { review: quiz.review }),
    },
  };
}
