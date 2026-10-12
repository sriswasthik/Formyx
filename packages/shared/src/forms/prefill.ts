import type { AnswerValue } from './answers.js';
import type { FieldType } from './field-types.js';
import type { Field } from './fields.js';
import type { FormSchema } from './form-schema.js';
import { hiddenFieldValues } from './pages.js';
import { validateAnswer } from './submission.js';

/*
 * Prefilled links: `/f/survey?fld_abc=Ada&fld_size=Large` starts the form with those answers.
 * Each question is named by its id; values are read as people would type them (an option by
 * its label, yes or no, a number, a date), and anything that would not be a valid answer is
 * ignored, so a mistyped link never breaks the form. Respondents can change prefilled answers.
 */

/** The questions a link can fill. */
export const PREFILLABLE_TYPES: readonly FieldType[] = [
  'short_text',
  'long_text',
  'email',
  'phone',
  'url',
  'number',
  'currency',
  'slider',
  'rating',
  'nps',
  'opinion_scale',
  'single_choice',
  'dropdown',
  'multi_choice',
  'yes_no',
  'date',
  'time',
];

export function isPrefillable(field: Pick<Field, 'type'>): boolean {
  return PREFILLABLE_TYPES.includes(field.type);
}

function optionId(field: Field, text: string): string | undefined {
  if (!('options' in field)) return undefined;
  const wanted = text.trim().toLowerCase();
  return field.options.find(
    (option) => option.id === text.trim() || option.label.trim().toLowerCase() === wanted,
  )?.id;
}

/** `raw` read as an answer to `field`, or `undefined` if it would not be a valid one. */
export function prefillValue(field: Field, raw: string): AnswerValue | undefined {
  const text = raw.trim();
  if (text === '' || !isPrefillable(field)) return undefined;
  let value: AnswerValue | undefined;
  switch (field.type) {
    case 'number':
    case 'currency':
    case 'slider':
    case 'rating':
    case 'nps':
    case 'opinion_scale': {
      const number = Number(text.replace(/,/g, ''));
      value = Number.isFinite(number) ? number : undefined;
      break;
    }
    case 'single_choice':
    case 'dropdown':
      value = optionId(field, text);
      break;
    case 'multi_choice': {
      const ids = text.split(',').map((part) => optionId(field, part));
      value = ids.every((id) => id !== undefined) ? [...new Set(ids)] : undefined;
      break;
    }
    case 'yes_no':
      value = ['yes', 'no'].includes(text.toLowerCase()) ? text.toLowerCase() : undefined;
      break;
    default:
      value = text;
  }
  // Checked as an answer would be (as if optional: empty is no answer, not a problem).
  return value !== undefined && validateAnswer({ ...field, required: false }, value) === null
    ? value
    : undefined;
}

/** Answers the link fills: hidden fields by their parameter, other questions by their id. */
export function linkAnswers(
  schema: Pick<FormSchema, 'fields'>,
  params: URLSearchParams,
): Record<string, AnswerValue> {
  const answers: Record<string, AnswerValue> = {};
  for (const field of schema.fields) {
    const raw = params.get(field.id);
    if (raw === null) continue;
    const value = prefillValue(field, raw);
    if (value !== undefined) answers[field.id] = value;
  }
  return { ...answers, ...hiddenFieldValues(schema, params) };
}

/** A link to `formUrl` that prefills `values` (question id to text, as people would type). */
export function prefilledLink(formUrl: string, values: Readonly<Record<string, string>>): string {
  const url = new URL(formUrl);
  for (const [fieldId, value] of Object.entries(values)) {
    if (value.trim() !== '') url.searchParams.set(fieldId, value.trim());
  }
  return url.toString();
}
