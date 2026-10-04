import { z } from 'zod';
import { FORM_SCHEMA_VERSION, formSchema, type FormSchema } from './form-schema.js';

type SchemaData = Record<string, unknown>;

/** Turns a schema of one version into the next; it must set the new `version`. */
export type FormSchemaUpgrade = (schema: SchemaData) => SchemaData;

/**
 * Upgrade steps by the version they start from. When a change to questions or settings needs
 * old schemas rewritten, bump FORM_SCHEMA_VERSION and add the step from the previous version
 * here; stored forms then upgrade on read and with `scripts/migrate-forms.ts` in the API.
 */
export const FORM_SCHEMA_UPGRADES: Readonly<Record<number, FormSchemaUpgrade>> = {};

function isSchemaData(value: unknown): value is SchemaData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Runs the upgrade steps from the schema's version up to `target`. Anything it cannot upgrade
 * (not an object, no step for its version, or newer than `target`) comes back unchanged, so
 * validation then says what is wrong.
 */
export function upgradeFormSchemaData(
  stored: unknown,
  upgrades: Readonly<Record<number, FormSchemaUpgrade>> = FORM_SCHEMA_UPGRADES,
  target: number = FORM_SCHEMA_VERSION,
): unknown {
  let current = stored;
  while (isSchemaData(current) && typeof current.version === 'number' && current.version < target) {
    const upgrade = upgrades[current.version];
    if (!upgrade) return current;
    current = upgrade(current);
  }
  return current;
}

/** A stored form schema of any known version, upgraded to the current one and validated. */
export const storedFormSchemaSchema = z.preprocess(
  (value) => upgradeFormSchemaData(value),
  formSchema,
);

/** Upgrades and validates a stored form schema; throws a ZodError if it does not hold up. */
export function migrateFormSchema(stored: unknown): FormSchema {
  return storedFormSchemaSchema.parse(stored);
}
