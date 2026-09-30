import { operatorNeedsValue, type Condition } from './conditions.js';
import { isAnswerableFieldType } from './field-types.js';
import type { Field } from './fields.js';
import type { FormSchema } from './form-schema.js';

/**
 * An answer to one question: text for text, email, phone and date (YYYY-MM-DD) questions,
 * a number for number and rating questions, an option id for single choice and dropdown,
 * and a list of option ids for multiple choice. `null` means "not answered".
 */
export type AnswerValue = string | number | string[] | null;
export type Answers = Readonly<Record<string, AnswerValue | undefined>>;

export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return Number.isFinite(value);
}

function asNumber(value: AnswerValue | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function compare(source: Field, answer: AnswerValue, expected: string | number): number | null {
  if (source.type === 'date') {
    return typeof answer === 'string' && typeof expected === 'string'
      ? answer.localeCompare(expected)
      : null;
  }
  const actual = asNumber(answer);
  const target = typeof expected === 'number' ? expected : Number(expected);
  return actual === null || !Number.isFinite(target) ? null : actual - target;
}

function equals(source: Field, answer: AnswerValue, expected: string | number): boolean {
  switch (source.type) {
    case 'number':
    case 'rating':
    case 'date':
      return compare(source, answer, expected) === 0;
    case 'single_choice':
    case 'dropdown':
      return answer === expected;
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
