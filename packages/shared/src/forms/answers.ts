import { operatorNeedsValue, type Condition } from './conditions.js';
import { isAnswerableFieldType } from './field-types.js';
import type { Field } from './fields.js';
import {
  isAddressAnswer,
  isDateRangeAnswer,
  type AddressAnswer,
  type DateRangeAnswer,
  type MatrixAnswer,
} from './answer-values.js';
import { isFileAnswer, type FileAnswer } from './files.js';
import type { FormSchema } from './form-schema.js';

/**
 * An answer to one question:
 * - text: text, email, phone (E.164), date (YYYY-MM-DD), time (HH:MM), website, colour
 *   (#RRGGBB), hidden fields, and "yes" or "no";
 * - a number: number, rating, NPS, opinion scale, slider and amount;
 * - an option id: single choice, dropdown and single picture choice; a list of them:
 *   multiple choice, multiple picture choice and ranking (in ranked order);
 * - `true`: consent given;
 * - an uploaded file: file, signature and voice note;
 * - an object: address, date range and matrix (see `answer-values.ts`).
 * `null` means "not answered".
 */
export type AnswerValue =
  | string
  | number
  | boolean
  | string[]
  | FileAnswer
  | AddressAnswer
  | DateRangeAnswer
  | MatrixAnswer
  | null;
export type Answers = Readonly<Record<string, AnswerValue | undefined>>;

export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value;
  if (isFileAnswer(value)) return true;
  if (isAddressAnswer(value)) {
    return [value.line1, value.line2, value.pin, value.city, value.state].some(
      (part) => part !== undefined && part.trim() !== '',
    );
  }
  if (isDateRangeAnswer(value)) return value.start !== '' || value.end !== '';
  // A matrix: answered once any row is.
  return Object.values(value).some((picked) =>
    Array.isArray(picked) ? picked.length > 0 : picked !== '',
  );
}

/** Answers compared as numbers in conditions. */
const NUMERIC_TYPES: readonly Field['type'][] = [
  'number',
  'rating',
  'nps',
  'opinion_scale',
  'slider',
  'currency',
];

function asNumber(value: AnswerValue | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function compare(source: Field, answer: AnswerValue, expected: string | number): number | null {
  if (source.type === 'date' || source.type === 'time') {
    return typeof answer === 'string' && typeof expected === 'string'
      ? answer.localeCompare(expected)
      : null;
  }
  const actual = asNumber(answer);
  const target = typeof expected === 'number' ? expected : Number(expected);
  return actual === null || !Number.isFinite(target) ? null : actual - target;
}

function equals(source: Field, answer: AnswerValue, expected: string | number): boolean {
  if (NUMERIC_TYPES.includes(source.type)) return compare(source, answer, expected) === 0;
  switch (source.type) {
    case 'date':
    case 'time':
      return compare(source, answer, expected) === 0;
    case 'single_choice':
    case 'dropdown':
    case 'yes_no':
      return answer === expected;
    case 'picture_choice':
      // One picture picked, and it is this one.
      return Array.isArray(answer)
        ? answer.length === 1 && answer[0] === expected
        : answer === expected;
    default:
      return (
        typeof answer === 'string' &&
        answer.trim().toLowerCase() === String(expected).trim().toLowerCase()
      );
  }
}

/**
 * Whether one condition holds. Comparisons need an answer: an unanswered question is
 * neither "is Yes" nor "is not Yes". A condition still missing its value is not decided
 * yet, so it returns `null` and is left out.
 */
export function evaluateCondition(
  condition: Condition,
  source: Field,
  answer: AnswerValue | undefined,
): boolean | null {
  const { operator, value } = condition;
  if (operator === 'is_answered') return isAnswered(answer);
  if (operator === 'is_not_answered') return !isAnswered(answer);
  if (operatorNeedsValue(operator) && value === undefined) return null;
  if (!isAnswered(answer) || answer === undefined || answer === null || value === undefined) {
    return false;
  }

  switch (operator) {
    case 'equals':
      return equals(source, answer, value);
    case 'not_equals':
      return !equals(source, answer, value);
    case 'contains':
      if (Array.isArray(answer)) return answer.includes(String(value));
      return (
        typeof answer === 'string' &&
        answer.toLowerCase().includes(String(value).trim().toLowerCase())
      );
    case 'greater_than': {
      const difference = compare(source, answer, value);
      return difference !== null && difference > 0;
    }
    case 'less_than': {
      const difference = compare(source, answer, value);
      return difference !== null && difference < 0;
    }
  }
}

/**
 * Ids of the questions a respondent sees given their answers so far. Conditions only look
 * back, so one pass in order is enough. The answer to a hidden question counts as empty,
 * so a chain of conditions collapses when an early link fails.
 */
export function evaluateVisibility(schema: FormSchema, answers: Answers): Set<string> {
  const visible = new Set<string>();
  const byId = new Map(schema.fields.map((field) => [field.id, field]));

  for (const field of schema.fields) {
    const results = (field.conditions ?? []).flatMap((condition) => {
      const source = byId.get(condition.sourceFieldId);
      if (!source) return [];
      const answer = visible.has(source.id) ? answers[source.id] : undefined;
      const result = evaluateCondition(condition, source, answer);
      return result === null ? [] : [result];
    });

    const shown =
      results.length === 0 ||
      (field.conditionMatch === 'any' ? results.some(Boolean) : results.every(Boolean));
    if (shown) visible.add(field.id);
  }
  return visible;
}

/**
 * Only the answers that count: those to visible questions that take an answer. Answers to
 * hidden, unknown or statement questions are dropped, and so are empty ones.
 */
export function sanitizeAnswers(schema: FormSchema, answers: Answers): Record<string, AnswerValue> {
  const visible = evaluateVisibility(schema, answers);
  const kept: Record<string, AnswerValue> = {};
  for (const field of schema.fields) {
    const value = answers[field.id];
    if (!visible.has(field.id) || !isAnswerableFieldType(field.type) || !isAnswered(value)) {
      continue;
    }
    if (value !== undefined) kept[field.id] = value;
  }
  return kept;
}
