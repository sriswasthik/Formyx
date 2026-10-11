import { z } from 'zod';
import { answerTestProblem } from './condition-checks.js';
import type { Condition } from './conditions.js';
import { fieldSchema, type Field } from './fields.js';
import { checkLogicIntegrity } from './logic-integrity.js';
import { repairLogic } from './logic-repair.js';
import { formLogicSchema, type FormLogic } from './logic-schema.js';

/**
 * 2: Sprint 12's question types, rich-text statements and phone country codes.
 * 3: Sprint 13's logic: page jumps, variables, quizzes and end screens.
 */
export const FORM_SCHEMA_VERSION = 3;
export const MAX_FIELDS = 250;
export const FORM_DESCRIPTION_MAX_LENGTH = 2000;

export const formSettingsSchema = z.object({
  submitButtonText: z
    .string()
    .trim()
    .min(1, 'Enter the button text')
    .max(40, 'Use 40 characters or fewer'),
  /**
   * Keeping respondents' answers while they fill the form in: `browser` keeps them on their
   * device, `email` also lets them email themselves a link to finish later.
   */
  saveProgress: z.enum(['off', 'browser', 'email']),
  /** Stop accepting responses after this many. */
  closeAfterResponses: z.number().int().min(1).max(1_000_000).optional(),
  /** Stop accepting responses at this moment (ISO 8601). */
  closeAt: z.iso.datetime({ offset: true, error: 'Use an ISO 8601 date and time' }).optional(),
});
export type FormSettings = z.infer<typeof formSettingsSchema>;

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
  return answerTestProblem(source, condition.operator, condition.value);
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
    logic: formLogicSchema,
  })
  .superRefine((form, ctx) => {
    checkIntegrity(form, ctx);
    checkLogicIntegrity(form.fields, form.logic, ctx);
  });
export type FormSchema = z.infer<typeof formSchema>;

/**
 * Drops conditions and logic that no longer hold together, e.g. after a question was moved
 * above the one it depends on, or an option it checks for was deleted (see `repairLogic`).
 * Editors run this after structural changes, so drafts always stay valid. Returns the same
 * object if nothing changed.
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

  const repaired: { logic: FormLogic; removed: number } = repairLogic(fields, form.logic);
  removed += repaired.removed;
  return removed === 0
    ? { form, removed }
    : { form: { ...form, fields, logic: repaired.logic }, removed };
}
