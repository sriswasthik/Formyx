import type { ValidationIssue } from '../errors.js';
import { operatorNeedsValue } from './conditions.js';
import { isAnswerableFieldType } from './field-types.js';
import type { FormSchema } from './form-schema.js';

/**
 * What stands between a draft and publishing it. Drafts may be unfinished; a published form
 * needs a label on every question and option, options on choice questions, and a value on
 * every condition. Paths match the draft's, so editors can point at the right input.
 */
export function findPublishIssues(schema: FormSchema): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!schema.fields.some((field) => isAnswerableFieldType(field.type))) {
    issues.push({ path: 'fields', message: 'Add at least one question that takes an answer' });
  }

  schema.fields.forEach((field, index) => {
    const at = `fields.${index}`;
    if (field.label.trim() === '') {
      issues.push({
        path: `${at}.label`,
        message: field.type === 'statement' ? 'Write the text' : 'Write the question',
      });
    }

    if ('options' in field) {
      if (field.options.length === 0) {
        issues.push({ path: `${at}.options`, message: 'Add at least one option' });
      }
      field.options.forEach((option, optionIndex) => {
        if (option.label.trim() === '') {
          issues.push({ path: `${at}.options.${optionIndex}.label`, message: 'Name this option' });
        }
      });
    }

    field.conditions?.forEach((condition, conditionIndex) => {
      const { operator, value } = condition;
      const missing = value === undefined || (typeof value === 'string' && value.trim() === '');
      if (operatorNeedsValue(operator) && missing) {
        issues.push({
          path: `${at}.conditions.${conditionIndex}.value`,
          message: 'Choose a value for this condition',
        });
      }
    });
  });

  return issues;
}

/** JSON with object keys sorted and `undefined` properties left out. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return current;
    return Object.fromEntries(
      Object.entries(current as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
    );
  });
}

/**
 * Whether two schemas say the same thing. Postgres `jsonb` reorders object keys, so a stored
 * snapshot and an in-memory draft can differ in key order alone.
 */
export function isSameFormSchema(a: FormSchema | null, b: FormSchema | null): boolean {
  if (a === null || b === null) return a === b;
  return canonicalJson(a) === canonicalJson(b);
}
