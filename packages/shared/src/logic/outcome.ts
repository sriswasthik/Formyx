import type { Answers } from '../forms/answers.js';
import type { FormSchema } from '../forms/form-schema.js';
import {
  QUIZ_PERCENT_VARIABLE,
  QUIZ_SCORE_VARIABLE,
  type EndScreen,
} from '../forms/logic-schema.js';
import { conditionsHold } from './evaluate.js';
import { resolvePath } from './navigation.js';
import { markQuiz, type QuizResult } from './quiz.js';

/** Where a response ended up: what the server stores, and what the end screen shows. */
export interface ResponseOutcome {
  /** Pages the respondent went through, in order. */
  pages: string[];
  endScreenId: string;
  /** Variables, and the quiz score and percentage when there is a quiz. */
  values: Record<string, number>;
  quiz: QuizResult | null;
}

/**
 * The end screen for a response: the one a jump sent it to; otherwise the first of the
 * others whose conditions hold (one without conditions is only reached by jumps); otherwise
 * the first, the default.
 */
export function chooseEndScreen(
  endScreens: readonly EndScreen[],
  context: Parameters<typeof conditionsHold>[2] & { endJump: string | null },
): EndScreen {
  const jumped = context.endJump
    ? endScreens.find((screen) => screen.id === context.endJump)
    : undefined;
  if (jumped) return jumped;
  const matched = endScreens
    .slice(1)
    .find((screen) => screen.when.length > 0 && conditionsHold(screen.when, screen.match, context));
  const fallback = matched ?? endScreens[0];
  if (!fallback) throw new Error('A form keeps at least one end screen');
  return fallback;
}

/**
 * Works out a response's outcome from its answers alone: the route, the variables, the quiz
 * mark and the end screen. The server runs this on every submission and stores the result,
 * whatever the browser worked out. In the browser the quiz answers are not known (see
 * `toPublicSchema`), so there `quiz` is `null` and quiz conditions wait for the server.
 */
export function computeOutcome(
  schema: Pick<FormSchema, 'fields' | 'logic'>,
  answers: Answers,
): ResponseOutcome {
  const path = resolvePath(schema, answers);
  const quiz = markQuiz(schema.logic, schema.fields, answers, path.active);
  const values = {
    ...path.values,
    ...(quiz && { [QUIZ_SCORE_VARIABLE]: quiz.score, [QUIZ_PERCENT_VARIABLE]: quiz.percent }),
  };
  const activeAnswers: Record<string, Answers[string]> = {};
  for (const id of path.active) activeAnswers[id] = answers[id];
  const endScreen = chooseEndScreen(schema.logic.endScreens, {
    fieldById: new Map(schema.fields.map((field) => [field.id, field])),
    answers: activeAnswers,
    values,
    quizPassed: quiz?.passed,
    endJump: path.endJump,
  });
  return { pages: path.pages, endScreenId: endScreen.id, values, quiz };
}
