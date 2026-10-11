import { z } from 'zod';
import {
  CONDITION_OPERATOR_LABELS,
  OPERATORS_BY_FIELD_TYPE,
  operatorNeedsValue,
  type Condition,
} from './conditions.js';
import { FIELD_TYPE_LABELS, isAnswerableFieldType } from './field-types.js';
import { TIME_PATTERN } from './answer-values.js';
import { fieldSchema, type Field } from './fields.js';

/** 2: Sprint 12's question types, rich-text statements and phone country codes. */
export const FORM_SCHEMA_VERSION = 2;
export const MAX_FIELDS = 250;
export const FORM_DESCRIPTION_MAX_LENGTH = 2000;

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
    case 'nps':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10
        ? null
        : 'Pick a score from 0 to 10';
    case 'opinion_scale':
      return typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= source.start &&
        value <= source.end
        ? null
        : `Pick a value from ${source.start} to ${source.end}`;
    case 'slider':
    case 'currency':
      return typeof value === 'number' ? null : 'Enter a number';
    case 'time':
      return typeof value === 'string' && TIME_PATTERN.test(value)
        ? null
        : 'Use a time such as 14:30';
    case 'yes_no':
      return value === 'yes' || value === 'no' ? null : 'Choose yes or no';
    case 'picture_choice':
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

export interface ConditionProblem {
  key: keyof Condition;
  message: string;
}

/** First index of every field id; later duplicates are reported separately. */
function indexFieldIds(fields: readonly Field[]): Map<string, number> {
  const indexById = new Map<string, number>();
  fields.forEach((field, index) => {
    if (!indexById.has(field.id)) indexById.set(field.id, index);
  });
  return indexById;
}

/**
 * Why a condition on `fields[fieldIndex]` is broken, or `null` if it is sound. Conditions
 * may only look back at earlier, answerable questions, with an operator and value that
 * suit them. Looking back only rules out cycles.
 */
function findConditionProblem(
  fields: readonly Field[],
  indexById: ReadonlyMap<string, number>,
  fieldIndex: number,
  condition: Condition,
): ConditionProblem | null {
  const sourceIndex = indexById.get(condition.sourceFieldId);
  const source = sourceIndex === undefined ? undefined : fields[sourceIndex];
  if (sourceIndex === undefined || !source) {
    return { key: 'sourceFieldId', message: 'Refers to a question that does not exist' };
  }
  if (sourceIndex === fieldIndex) {
    return { key: 'sourceFieldId', message: 'A question cannot depend on itself' };
  }
  if (sourceIndex > fieldIndex) {
    return { key: 'sourceFieldId', message: 'Can only depend on an earlier question' };
  }
  if (!isAnswerableFieldType(source.type)) {
    return { key: 'sourceFieldId', message: 'Content blocks have no answer to check' };
  }
  if (!OPERATORS_BY_FIELD_TYPE[source.type].includes(condition.operator)) {
    const type = FIELD_TYPE_LABELS[source.type].toLowerCase();
    return {
      key: 'operator',
      message: `"${CONDITION_OPERATOR_LABELS[condition.operator]}" does not apply to ${type} questions`,
    };
  }
  const valueProblem = conditionValueProblem(source, condition);
  return valueProblem ? { key: 'value', message: valueProblem } : null;
}

/** Rules that span fields: unique question and option ids, and sound conditions. */
function checkIntegrity(form: { fields: Field[] }, ctx: z.RefinementCtx): void {
  const seenIds = new Set<string>();

  form.fields.forEach((field, index) => {
    if (seenIds.has(field.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields', index, 'id'],
        message: 'Another question already uses this id',
      });
    }
    seenIds.add(field.id);

    const uniqueIds = (key: 'options' | 'rows' | 'columns', items: readonly { id: string }[]) => {
      const seen = new Set<string>();
      items.forEach((item, itemIndex) => {
        if (seen.has(item.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['fields', index, key, itemIndex, 'id'],
            message: `Another ${key.slice(0, -1)} already uses this id`,
          });
        }
        seen.add(item.id);
      });
    };
    if ('options' in field) uniqueIds('options', field.options);
    if (field.type === 'matrix') {
      uniqueIds('rows', field.rows);
      uniqueIds('columns', field.columns);
    }
    if (field.type === 'slider') {
      if (field.max <= field.min) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', index, 'max'],
          message: 'Use a maximum above the minimum',
        });
      } else if (field.step > field.max - field.min) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', index, 'step'],
          message: 'Use a step no bigger than the range',
        });
      }
    }
    if (field.type === 'opinion_scale' && field.end <= field.start) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields', index, 'end'],
        message: 'End the scale above where it starts',
      });
    }
  });

  const indexById = indexFieldIds(form.fields);
  form.fields.forEach((field, index) => {
    field.conditions?.forEach((condition, conditionIndex) => {
      const problem = findConditionProblem(form.fields, indexById, index, condition);
      if (problem) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', index, 'conditions', conditionIndex, problem.key],
          message: problem.message,
        });
      }
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
    /** Shown under the title, to introduce the form. */
    description: z
      .string()
      .max(FORM_DESCRIPTION_MAX_LENGTH, `Use ${FORM_DESCRIPTION_MAX_LENGTH} characters or fewer`)
      .optional(),
    fields: z.array(fieldSchema).max(MAX_FIELDS, `Forms can have at most ${MAX_FIELDS} questions`),
    settings: formSettingsSchema,
  })
  .superRefine(checkIntegrity);
export type FormSchema = z.infer<typeof formSchema>;

/**
 * Drops conditions that no longer hold together, e.g. after a question was moved above the
 * one it depends on, or an option it checks for was deleted. Editors run this after
 * structural changes, so drafts always stay valid. Returns the same object if nothing changed.
 */
export function removeBrokenConditions(form: FormSchema): { form: FormSchema; removed: number } {
  const indexById = indexFieldIds(form.fields);
  let removed = 0;

  const fields = form.fields.map((field, index) => {
    if (!field.conditions?.length) return field;
    const kept = field.conditions.filter(
      (condition) => !findConditionProblem(form.fields, indexById, index, condition),
    );
    if (kept.length === field.conditions.length) return field;

    removed += field.conditions.length - kept.length;
    const { conditions: _conditions, conditionMatch: _match, ...rest } = field;
    return kept.length > 0
      ? { ...field, conditions: kept }
      : // Nothing left to match, so the match mode goes too.
        rest;
  });

  return removed === 0 ? { form, removed } : { form: { ...form, fields }, removed };
}
