import { isAnswerableFieldType } from './field-types.js';
import type { Field } from './fields.js';
import { isFileAnswer } from './files.js';
import type { FormSchema } from './form-schema.js';

/** The questions of `schema` that collect an answer: everything except statements. */
export function answerableFields(schema: FormSchema): Field[] {
  return schema.fields.filter((field) => isAnswerableFieldType(field.type));
}

/** Shown for a chosen option that has since been removed from the form. */
export const REMOVED_OPTION_LABEL = 'Removed option';

/** The label of option `id` of a choice question, or a placeholder if it no longer exists. */
export function optionLabel(field: Field, id: string): string {
  if (!('options' in field)) return id;
  return field.options.find((option) => option.id === id)?.label ?? REMOVED_OPTION_LABEL;
}

/**
 * An answer as plain text: option labels for choices, numbers and ratings as digits, dates
 * as stored (YYYY-MM-DD), files by name. Empty for no answer. Stored answers were validated against the
 * form as it was then, so a value that no longer fits its question is still shown as text.
 */
export function formatAnswer(field: Field, value: unknown): string {
  if (value === null || value === undefined) return '';

  switch (field.type) {
    case 'single_choice':
    case 'dropdown':
      return typeof value === 'string' ? optionLabel(field, value) : stringify(value);
    case 'multi_choice':
      return Array.isArray(value)
        ? value.map((id) => (typeof id === 'string' ? optionLabel(field, id) : '')).join(', ')
        : stringify(value);
    default:
      return stringify(value);
  }
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isFileAnswer(value)) return value.name;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (Array.isArray(value)) return value.map(stringify).join(', ');
  return '';
}
