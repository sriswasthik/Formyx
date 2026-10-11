import type { AnswerValue, Answers } from '../forms/answers.js';
import type { Field } from '../forms/fields.js';
import type { FormLogic, QuizAnswer } from '../forms/logic-schema.js';

/** How one quiz question went, for revealing the answers. */
export interface QuizReviewItem {
  fieldId: string;
  correct: boolean;
  answered: boolean;
  points: number;
  /** The right answers: option ids, or the accepted texts and numbers. */
  expected: string[];
}

export interface QuizResult {
  score: number;
  /** Points possible on the respondent's route. */
  max: number;
  /** `score` as a share of `max`, 0 to 100, rounded. */
  percent: number;
  /** Against the pass mark; `null` when the quiz has none. */
  passed: boolean | null;
  review: QuizReviewItem[];
}

/** Case, accents' spacing and repeated spaces ignored: "  New   delhi " is "new delhi". */
function normalise(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function sameSet(picked: readonly string[], expected: readonly string[]): boolean {
  const want = new Set(expected);
  return picked.length === want.size && picked.every((id) => want.has(id));
}

/** Whether `answer` to `field` is right. An empty answer key means nothing is right. */
export function isCorrectAnswer(
  field: Field,
  answer: AnswerValue | undefined,
  key: Pick<QuizAnswer, 'correct'>,
): boolean {
  if (answer === undefined || answer === null || key.correct.length === 0) return false;
  switch (field.type) {
    case 'single_choice':
    case 'dropdown':
    case 'yes_no':
      return typeof answer === 'string' && key.correct.includes(answer);
    case 'picture_choice':
      if (typeof answer === 'string') return key.correct.includes(answer);
      return Array.isArray(answer) && sameSet(answer, key.correct);
    case 'multi_choice':
      return Array.isArray(answer) && sameSet(answer, key.correct);
    case 'short_text':
      return (
        typeof answer === 'string' &&
        key.correct.some((text) => normalise(text) === normalise(answer))
      );
    case 'number': {
      const value = typeof answer === 'number' ? answer : Number(answer);
      return Number.isFinite(value) && key.correct.some((text) => Number(text) === value);
    }
    default:
      return false;
  }
}

/**
 * Marks the quiz: points for each right answer to a quiz question the respondent saw
 * (`active`). Questions a jump skipped count neither for nor against them. `null` when the
 * form has no quiz.
 */
export function markQuiz(
  logic: Pick<FormLogic, 'quiz'>,
  fields: readonly Field[],
  answers: Answers,
  active: ReadonlySet<string>,
): QuizResult | null {
  const quiz = logic.quiz;
  if (!quiz?.enabled) return null;
  let score = 0;
  let max = 0;
  const review: QuizReviewItem[] = [];
  for (const field of fields) {
    const key = quiz.answers[field.id];
    if (!key || !active.has(field.id)) continue;
    const answer = answers[field.id];
    const correct = isCorrectAnswer(field, answer, key);
    max += key.points;
    if (correct) score += key.points;
    review.push({
      fieldId: field.id,
      correct,
      answered: answer !== undefined && answer !== null,
      points: key.points,
      expected: key.correct,
    });
  }
  const percent = max === 0 ? 0 : Math.round((score / max) * 100);
  const passed = quiz.passPercent === undefined ? null : percent >= quiz.passPercent;
  return { score, max, percent, passed, review };
}
