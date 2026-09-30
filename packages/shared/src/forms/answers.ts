import { z } from 'zod';
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
 * back, so one pass in order is enough; answers to hidden questions do not count.
 */
export function getVisibleFieldIds(schema: FormSchema, answers: Answers): Set<string> {
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

const emailSchema = z.email();
const PHONE_PATTERN = /^\+?[\d\s().-]{5,25}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** The problem with one answer, or `null` if it is fine. Assumes the question is visible. */
export function validateAnswer(field: Field, value: AnswerValue | undefined): string | null {
  if (!isAnswerableFieldType(field.type)) return null;
  if (!isAnswered(value)) return field.required ? 'This question is required' : null;

  switch (field.type) {
    case 'short_text':
    case 'long_text': {
      if (typeof value !== 'string') return 'Enter text';
      const length = value.trim().length;
      const { minLength, maxLength } = field.validation ?? {};
      if (minLength !== undefined && length < minLength) {
        return `Use at least ${plural(minLength, 'character')}`;
      }
      if (maxLength !== undefined && length > maxLength) {
        return `Use ${plural(maxLength, 'character')} or fewer`;
      }
      return null;
    }
    case 'email':
      return typeof value === 'string' && emailSchema.safeParse(value.trim()).success
        ? null
        : 'Enter a valid email address';
    case 'phone': {
      const digits = typeof value === 'string' ? value.replace(/\D/g, '').length : 0;
      return typeof value === 'string' && PHONE_PATTERN.test(value.trim()) && digits >= 5
        ? null
        : 'Enter a valid phone number';
    }
    case 'number': {
      const number = asNumber(value ?? null);
      if (number === null) return 'Enter a number';
      const { min, max } = field.validation ?? {};
      if (min !== undefined && number < min) return `Enter a number of at least ${min}`;
      if (max !== undefined && number > max) return `Enter a number of at most ${max}`;
      return null;
    }
    case 'rating':
      return typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= field.ratingScale
        ? null
        : `Pick a rating from 1 to ${field.ratingScale}`;
    case 'date':
      return typeof value === 'string' && isValidDate(value) ? null : 'Enter a valid date';
    case 'single_choice':
    case 'dropdown':
      return field.options.some((option) => option.id === value) ? null : 'Choose an option';
    case 'multi_choice':
      return Array.isArray(value) &&
        value.every((id) => field.options.some((option) => option.id === id))
        ? null
        : 'Choose from the options';
    case 'file':
      // Uploads arrive in a later sprint; any selected file counts for now.
      return null;
    case 'statement':
      return null;
  }
}

/** Problems keyed by field id, for visible questions only (hidden ones are skipped). */
export function validateAnswers(schema: FormSchema, answers: Answers): Record<string, string> {
  const visible = getVisibleFieldIds(schema, answers);
  const errors: Record<string, string> = {};
  for (const field of schema.fields) {
    if (!visible.has(field.id)) continue;
    const problem = validateAnswer(field, answers[field.id]);
    if (problem) errors[field.id] = problem;
  }
  return errors;
}
