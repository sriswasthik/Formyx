import type { FieldType } from './field-types.js';

/**
 * Questions whose answers are personal details: how to reach someone, where they live, and
 * files, signatures and recordings of them. Forms with any of these say who gets them.
 */
export const PERSONAL_DATA_FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'email',
  'phone',
  'address',
  'file',
  'signature',
  'voice_note',
]);

/** Whether a form asks for personal details: in its questions, or an email address first. */
export function collectsPersonalData(
  schema: { fields: readonly { type: FieldType }[] },
  asksForEmail = false,
): boolean {
  return asksForEmail || schema.fields.some((field) => PERSONAL_DATA_FIELD_TYPES.has(field.type));
}
