import { isAddressAnswer, isDateRangeAnswer } from '../forms/answer-values.js';
import type { AnswerValue, Answers } from '../forms/answers.js';
import { isAnswerableFieldType } from '../forms/field-types.js';
import type { Field } from '../forms/fields.js';
import { isFileAnswer } from '../forms/files.js';
import { QUIZ_VARIABLES, type Variable } from '../forms/logic-schema.js';
import { escapeRichText } from '../forms/rich-text.js';

/*
 * Answer piping: `{{field:<id>}}` and `{{var:<id>}}` in labels, descriptions, page titles and
 * end screens become the respondent's answer or a calculated value as they go. Tokens refer
 * to ids, so renaming a question never breaks them.
 */

export const PIPE_PATTERN = /\{\{(field|var):([A-Za-z0-9_-]{1,64})\}\}/g;

export interface PipeToken {
  kind: 'field' | 'var';
  id: string;
  /** The token as written, such as `{{field:fld_abc}}`. */
  raw: string;
}

export function pipeToken(kind: PipeToken['kind'], id: string): string {
  return `{{${kind}:${id}}}`;
}

/** The tokens in `text`, in order. */
export function findPipeTokens(text: string): PipeToken[] {
  return [...text.matchAll(PIPE_PATTERN)].map((match) => ({
    kind: match[1] as PipeToken['kind'],
    id: match[2] ?? '',
    raw: match[0],
  }));
}

export function hasPipeTokens(text: string): boolean {
  return text.includes('{{') && findPipeTokens(text).length > 0;
}

export interface PipingContext {
  fieldById: ReadonlyMap<string, Field>;
  answers: Answers;
  values: Readonly<Record<string, number>>;
  variables: readonly Variable[];
}

function optionText(field: Field, id: string): string {
  if (field.type === 'yes_no') return id === 'yes' ? 'Yes' : id === 'no' ? 'No' : '';
  if (!('options' in field)) return id;
  return field.options.find((option) => option.id === id)?.label ?? '';
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', {
      style: 'currency',
      currency,
      // "₹1,500" in a sentence, "₹1,499.50" when there are paise.
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function plainNumber(value: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
}

/** An answer as words in a sentence: option labels, numbers, lists joined with commas. */
export function pipedAnswer(field: Field, value: AnswerValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') {
    if (field.type === 'currency') return money(value, field.currency);
    if (field.type === 'slider' && field.unit.trim())
      return `${plainNumber(value)} ${field.unit.trim()}`;
    return plainNumber(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : '';
  if (typeof value === 'string') {
    return 'options' in field || field.type === 'yes_no' ? optionText(field, value) : value.trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((id) => optionText(field, id))
      .filter(Boolean)
      .join(', ');
  }
  if (isFileAnswer(value)) return value.name;
  if (isAddressAnswer(value)) {
    return [value.line1, value.line2, value.city, value.state, value.pin]
      .filter((part) => part && part.trim() !== '')
      .join(', ');
  }
  if (isDateRangeAnswer(value)) return `${value.start} to ${value.end}`;
  return '';
}

/** A calculated value as words: prices in their currency, others with up to two decimals. */
export function pipedValue(variable: Variable | undefined, value: number | undefined): string {
  if (value === undefined) return '';
  if (variable?.kind === 'price' && variable.currency) return money(value, variable.currency);
  return plainNumber(value);
}

/**
 * `text` with its tokens replaced: answers not given yet, and things that no longer exist,
 * become nothing. In rich text (statements, end screens) the answers are escaped, so an
 * answer with `*` in it cannot turn the text bold.
 */
export function resolvePiping(
  text: string,
  context: PipingContext,
  options: { richText?: boolean } = {},
): string {
  if (!text.includes('{{')) return text;
  return text.replace(PIPE_PATTERN, (_raw, kind: string, id: string) => {
    let piped = '';
    if (kind === 'field') {
      const field = context.fieldById.get(id);
      piped =
        field && isAnswerableFieldType(field.type) ? pipedAnswer(field, context.answers[id]) : '';
    } else {
      piped = pipedValue(
        context.variables.find((variable) => variable.id === id),
        context.values[id],
      );
    }
    return options.richText ? escapeRichText(piped) : piped;
  });
}

/**
 * Why a token cannot be piped where it is, or `null` if it can. `earlier` holds the
 * questions answered before the text shows.
 */
export function pipeTokenProblem(
  token: PipeToken,
  fieldById: ReadonlyMap<string, Field>,
  earlier: ReadonlySet<string>,
  variables: readonly Variable[],
  options: { quiz: boolean },
): string | null {
  if (token.kind === 'var') {
    if (QUIZ_VARIABLES.includes(token.id)) {
      return options.quiz ? null : 'The quiz score can only be shown on end screens';
    }
    return variables.some((variable) => variable.id === token.id)
      ? null
      : 'Refers to a variable that no longer exists';
  }
  const field = fieldById.get(token.id);
  if (!field) return 'Refers to a question that no longer exists';
  if (!isAnswerableFieldType(field.type)) return 'Refers to something with no answer';
  if (!earlier.has(token.id)) return 'Can only show answers to earlier questions';
  return null;
}
