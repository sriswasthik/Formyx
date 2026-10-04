import { describe, expect, it } from 'vitest';
import { createEmptyForm } from './factories.js';
import { FORM_SCHEMA_VERSION } from './form-schema.js';
import {
  migrateFormSchema,
  storedFormSchemaSchema,
  upgradeFormSchemaData,
  type FormSchemaUpgrade,
} from './migrate-form-schema.js';

describe('migrateFormSchema', () => {
  it('takes current schemas as they are', () => {
    const form = createEmptyForm();
    expect(form.version).toBe(FORM_SCHEMA_VERSION);
    expect(migrateFormSchema(form)).toEqual(form);
  });

  it('refuses schemas it cannot read', () => {
    expect(() => migrateFormSchema({ ...createEmptyForm(), version: 99 })).toThrow();
    expect(() => migrateFormSchema('not a form')).toThrow();
    expect(storedFormSchemaSchema.safeParse({ ...createEmptyForm(), fields: 'none' }).success).toBe(
      false,
    );
  });
});

describe('upgradeFormSchemaData', () => {
  // Pretend versions 1 -> 2 -> 3, to check the steps run in order.
  const upgrades: Record<number, FormSchemaUpgrade> = {
    1: (schema) => ({ ...schema, version: 2, renamed: schema.old, old: undefined }),
    2: (schema) => ({ ...schema, version: 3, added: true }),
  };

  it('runs every step from the stored version up', () => {
    expect(upgradeFormSchemaData({ version: 1, old: 'x' }, upgrades, 3)).toEqual({
      version: 3,
      renamed: 'x',
      old: undefined,
      added: true,
    });
    expect(upgradeFormSchemaData({ version: 2 }, upgrades, 3)).toEqual({ version: 3, added: true });
  });

  it('leaves what it cannot upgrade for validation to report', () => {
    expect(upgradeFormSchemaData({ version: 3 }, upgrades, 3)).toEqual({ version: 3 });
    expect(upgradeFormSchemaData({ version: 0 }, upgrades, 3)).toEqual({ version: 0 });
    expect(upgradeFormSchemaData({ version: 4 }, upgrades, 3)).toEqual({ version: 4 });
    expect(upgradeFormSchemaData(null, upgrades, 3)).toBeNull();
  });
});
