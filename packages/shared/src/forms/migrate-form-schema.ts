import { z } from 'zod';
import { FORM_SCHEMA_VERSION, formSchema, type FormSchema } from './form-schema.js';
import { DEFAULT_PHONE_COUNTRY } from './phone.js';
import { escapeRichText } from './rich-text.js';

type SchemaData = Record<string, unknown>;

/** Turns a schema of one version into the next; it must set the new `version`. */
export type FormSchemaUpgrade = (schema: SchemaData) => SchemaData;

/**
 * Upgrade steps by the version they start from. When a change to questions or settings needs
 * old schemas rewritten, bump FORM_SCHEMA_VERSION and add the step from the previous version
 * here; stored forms then upgrade on read and with `scripts/migrate-forms.ts` in the API.
 */
export const FORM_SCHEMA_UPGRADES: Readonly<Record<number, FormSchemaUpgrade>> = {
  1: upgradeV1,
};

function isSchemaData(value: unknown): value is SchemaData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * v1 to v2 (Sprint 12), keeping how every form looks and works: statements become rich text
 * with their plain text escaped, so a `*` still shows as a star; phone questions get the
 * country picker, starting on India; ratings keep drawing numbers.
 */
function upgradeV1(schema: SchemaData): SchemaData {
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  return {
    ...schema,
    version: 2,
    fields: fields.map((field: unknown) => {
      if (!isSchemaData(field)) return field;
      switch (field.type) {
        case 'statement':
          return typeof field.label === 'string'
            ? { ...field, label: escapeRichText(field.label) }
            : field;
        case 'phone':
          return { ...field, defaultCountry: DEFAULT_PHONE_COUNTRY };
        case 'rating':
          return { ...field, ratingStyle: 'numbers' };
        default:
          return field;
      }
    }),
  };
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
