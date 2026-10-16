import { z } from 'zod';
import { answerableFields } from './answer-format.js';
import { fieldSchema, type Field } from './fields.js';
import type { FormSchema } from './form-schema.js';

/*
 * Questions deleted from a published form keep their answers: responses store answers by
 * question id, and a deleted question's definition is kept on the form (as it was last
 * published) so those answers can still be shown and exported, marked as deleted.
 */

/** Added to a deleted question's label wherever its answers are shown. */
export const DELETED_QUESTION_SUFFIX = ' (deleted question)';

/** At most this many deleted questions are kept; the oldest go first. */
export const MAX_RETIRED_FIELDS = 200;

/**
 * Stored deleted questions. Each is read on its own, so one saved by an older version that
 * no longer reads is dropped rather than losing the rest.
 */
export const retiredFieldsSchema = z
  .array(z.unknown())
  .catch([])
  .transform((fields) =>
    fields.flatMap((field) => {
      const parsed = fieldSchema.safeParse(field);
      return parsed.success ? [parsed.data] : [];
    }),
  );

/**
 * Publishing `next` over `previous`: the questions `previous` had that `next` drops join
 * those deleted before (`retired`), and any that `next` brings back leave. `added` are the
 * newly deleted ones, which are only worth keeping if they have answers (the caller checks).
 */
export function retireFields(
  previous: FormSchema | null,
  next: FormSchema,
  retired: readonly Field[],
): { kept: Field[]; added: Field[] } {
  const live = new Set(next.fields.map((field) => field.id));
  const known = new Set(retired.map((field) => field.id));
  const added = (previous ? answerableFields(previous) : []).filter(
    (field) => !live.has(field.id) && !known.has(field.id),
  );
  const kept = retired.filter((field) => !live.has(field.id));
  return { kept, added };
}

/** Keeps at most `MAX_RETIRED_FIELDS`, the most recently deleted. */
export function capRetiredFields(fields: readonly Field[]): Field[] {
  return fields.slice(-MAX_RETIRED_FIELDS);
}

/**
 * The questions responses are shown and exported with: the form's own, in order, then the
 * deleted ones that still have answers, labelled as deleted.
 */
export function responseFields(schema: FormSchema, retired: readonly Field[] = []): Field[] {
  const live = new Set(schema.fields.map((field) => field.id));
  return [
    ...answerableFields(schema),
    ...retired
      .filter((field) => !live.has(field.id))
      .map((field) => ({
        ...field,
        label: `${field.label.trim() || 'Untitled question'}${DELETED_QUESTION_SUFFIX}`,
      })),
  ];
}
