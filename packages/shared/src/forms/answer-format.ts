import {
  isAddressAnswer,
  isDateRangeAnswer,
  isMatrixAnswer,
  type AddressAnswer,
  type MatrixAnswer,
} from './answer-values.js';
import { isAnswerableFieldType } from './field-types.js';
import type { Field, FieldOfType } from './fields.js';
import { isFileAnswer } from './files.js';
import type { FormSchema } from './form-schema.js';
import { formatPhone } from './phone-lookup.js';

/** The questions of `schema` that collect an answer: everything except content blocks. */
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

/** The label of a matrix row or column, or a placeholder if it no longer exists. */
export function matrixLabel(
  field: FieldOfType<'matrix'>,
  key: 'rows' | 'columns',
  id: string,
): string {
  return field[key].find((item) => item.id === id)?.label ?? REMOVED_OPTION_LABEL;
}

/** "1,25,000.50" in rupees as "₹1,25,000.50"; other currencies with their own symbol. */
export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/** "12 Main Road, Flat 4, Bengaluru, Karnataka 560001". */
export function formatAddress(address: AddressAnswer): string {
  const street = [address.line1, address.line2]
    .filter((part) => part && part.trim() !== '')
    .join(', ');
  return [street, address.city, `${address.state} ${address.pin}`.trim()]
    .filter((part) => part !== '')
    .join(', ');
}

/** "Row 1: Good; Row 2: Fair, Poor". */
export function formatMatrix(field: FieldOfType<'matrix'>, answer: MatrixAnswer): string {
  return field.rows
    .filter((row) => row.id in answer)
    .map((row) => `${row.label}: ${matrixCell(field, answer[row.id])}`)
    .join('; ');
}

/** The column labels picked in one matrix row. */
export function matrixCell(field: FieldOfType<'matrix'>, picked: string | string[] | undefined) {
  if (picked === undefined) return '';
  const ids = Array.isArray(picked) ? picked : [picked];
  return ids.map((id) => matrixLabel(field, 'columns', id)).join(', ');
}

/**
 * An answer as plain text: option labels for choices, numbers and ratings as digits, dates
 * as stored (YYYY-MM-DD), files by name, amounts in their currency and the rest written out.
 * Empty for no answer. Stored answers were validated against the form as it was then, so a
 * value that no longer fits its question is still shown as text.
 */
export function formatAnswer(field: Field, value: unknown): string {
  if (value === null || value === undefined) return '';

  switch (field.type) {
    case 'single_choice':
    case 'dropdown':
      return typeof value === 'string' ? optionLabel(field, value) : stringify(value);
    case 'picture_choice':
      if (typeof value === 'string') return optionLabel(field, value);
      return Array.isArray(value)
        ? value.map((id) => (typeof id === 'string' ? optionLabel(field, id) : '')).join(', ')
        : stringify(value);
    case 'multi_choice':
      return Array.isArray(value)
        ? value.map((id) => (typeof id === 'string' ? optionLabel(field, id) : '')).join(', ')
        : stringify(value);
    case 'ranking':
      return Array.isArray(value)
        ? value
            .map(
              (id, index) =>
                `${index + 1}. ${typeof id === 'string' ? optionLabel(field, id) : ''}`,
            )
            .join('; ')
        : stringify(value);
    case 'yes_no':
      return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : stringify(value);
    case 'consent':
      return value === true ? 'Agreed' : stringify(value);
    case 'slider':
      return typeof value === 'number' && field.unit.trim() !== ''
        ? `${value} ${field.unit.trim()}`
        : stringify(value);
    case 'currency':
      return typeof value === 'number' ? formatCurrency(value, field.currency) : stringify(value);
    case 'phone':
      return typeof value === 'string' && value.startsWith('+')
        ? formatPhone(value)
        : stringify(value);
    case 'matrix':
      return isMatrixAnswer(value) ? formatMatrix(field, value) : stringify(value);
    case 'address':
      return isAddressAnswer(value) ? formatAddress(value) : stringify(value);
    case 'date_range':
      return isDateRangeAnswer(value) ? `${value.start} to ${value.end}` : stringify(value);
    default:
      return stringify(value);
  }
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isFileAnswer(value)) return value.name;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(stringify).join(', ');
  return '';
}
