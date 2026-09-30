import { z } from 'zod';
import {
  CONDITION_OPERATOR_LABELS,
  OPERATORS_BY_FIELD_TYPE,
  operatorNeedsValue,
  type Condition,
} from './conditions.js';
import { FIELD_TYPE_LABELS, isAnswerableFieldType } from './field-types.js';
import { fieldSchema, type Field } from './fields.js';

export const FORM_SCHEMA_VERSION = 1;
export const MAX_FIELDS = 250;

export const formSettingsSchema = z.object({
  submitButtonText: z
    .string()
    .trim()
    .min(1, 'Enter the button text')
    .max(40, 'Use 40 characters or fewer'),
  successMessage: z
    .string()
    .trim()
    .min(1, 'Enter a message')
    .max(1000, 'Use 1000 characters or fewer'),
  /** Stop accepting responses after this many. */
  closeAfterResponses: z.number().int().min(1).max(1_000_000).optional(),
  /** Stop accepting responses at this moment (ISO 8601). */
  closeAt: z.iso.datetime({ offset: true, error: 'Use an ISO 8601 date and time' }).optional(),
  /** Email workspace members about each new response. */
  notifyOnSubmit: z.boolean(),
});
export type FormSettings = z.infer<typeof formSettingsSchema>;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  return date.getUTCMonth() === (month ?? 0) - 1 && date.getUTCDate() === day;
}

/** Why `condition.value` does not fit its source field, or `null` if it does (or is not set yet). */
function conditionValueProblem(source: Field, { operator, value }: Condition): string | null {
  if (!operatorNeedsValue(operator) || value === undefined) return null;

  switch (source.type) {
    case 'number':
      return typeof value === 'number' ? null : 'Enter a number';
    case 'rating':
      return typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= source.ratingScale
        ? null
        : `Pick a rating from 1 to ${source.ratingScale}`;
    case 'date':
      return typeof value === 'string' && isIsoDate(value) ? null : 'Use a date such as 2026-09-30';
    case 'single_choice':
    case 'multi_choice':
    case 'dropdown':
      return source.options.some((option) => option.id === value)
        ? null
        : "Pick one of the question's options";
    default:
      return typeof value === 'string' ? null : 'Enter text';
  }
}

/**
 * Rules that span fields: unique ids, and conditions that only look back at earlier,
 * answerable questions with an operator and value that suit them. Looking back only
 * rules out cycles.
 */
function checkIntegrity(form: { fields: Field[] }, ctx: z.RefinementCtx): void {
  const indexById = new Map<string, number>();

  form.fields.forEach((field, index) => {
    if (indexById.has(field.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields', index, 'id'],
        message: 'Another question already uses this id',
      });
    } else {
      indexById.set(field.id, index);
    }

    if ('options' in field) {
      const seen = new Set<string>();
      field.options.forEach((option, optionIndex) => {
        if (seen.has(option.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['fields', index, 'options', optionIndex, 'id'],
            message: 'Another option already uses this id',
          });
        }
        seen.add(option.id);
      });
    }
  });

  form.fields.forEach((field, index) => {
    field.conditions?.forEach((condition, conditionIndex) => {
      const path = ['fields', index, 'conditions', conditionIndex];
      const issue = (key: keyof Condition, message: string) => {
        ctx.addIssue({ code: 'custom', path: [...path, key], message });
      };

      const sourceIndex = indexById.get(condition.sourceFieldId);
      const source = sourceIndex === undefined ? undefined : form.fields[sourceIndex];
      if (sourceIndex === undefined || !source) {
        issue('sourceFieldId', 'Refers to a question that does not exist');
        return;
      }
      if (sourceIndex === index) {
        issue('sourceFieldId', 'A question cannot depend on itself');
        return;
      }
      if (sourceIndex > index) {
        issue('sourceFieldId', 'Can only depend on an earlier question');
        return;
      }
      if (!isAnswerableFieldType(source.type)) {
        issue('sourceFieldId', 'Statements have no answer to check');
        return;
      }
      if (!OPERATORS_BY_FIELD_TYPE[source.type].includes(condition.operator)) {
        const type = FIELD_TYPE_LABELS[source.type].toLowerCase();
        issue(
          'operator',
          `"${CONDITION_OPERATOR_LABELS[condition.operator]}" does not apply to ${type} questions`,
        );
        return;
      }
      const valueProblem = conditionValueProblem(source, condition);
      if (valueProblem) issue('value', valueProblem);
    });
  });
}

/**
 * A form's questions and settings: what `draftSchema` and `publishedSchema` store. This
 * checks structure only, so unfinished drafts (empty labels, choice questions without
 * options, conditions without a value yet) still save.
 */
export const formSchema = z
  .object({
    version: z.literal(FORM_SCHEMA_VERSION),
    fields: z.array(fieldSchema).max(MAX_FIELDS, `Forms can have at most ${MAX_FIELDS} questions`),
    settings: formSettingsSchema,
  })
  .superRefine(checkIntegrity);
export type FormSchema = z.infer<typeof formSchema>;
