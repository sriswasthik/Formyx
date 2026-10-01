import type { FieldType } from './field-types.js';
import type { FieldOfType, FieldOption } from './fields.js';
import { FORM_SCHEMA_VERSION, type FormSchema, type FormSettings } from './form-schema.js';
import { createId } from './ids.js';

export function createOption(label: string): FieldOption {
  return { id: createId('opt'), label };
}

interface FieldBase {
  id: string;
  label: string;
  required: false;
}

type FieldFactories = { [T in FieldType]: (base: FieldBase) => FieldOfType<T> };

const defaultOptions = () => [createOption('Option 1'), createOption('Option 2')];

const factories: FieldFactories = {
  short_text: (base) => ({ ...base, type: 'short_text' }),
  long_text: (base) => ({ ...base, type: 'long_text' }),
  email: (base) => ({ ...base, type: 'email' }),
  number: (base) => ({ ...base, type: 'number' }),
  phone: (base) => ({ ...base, type: 'phone' }),
  single_choice: (base) => ({ ...base, type: 'single_choice', options: defaultOptions() }),
  multi_choice: (base) => ({ ...base, type: 'multi_choice', options: defaultOptions() }),
  dropdown: (base) => ({ ...base, type: 'dropdown', options: defaultOptions() }),
  rating: (base) => ({ ...base, type: 'rating', ratingScale: 5 }),
  date: (base) => ({ ...base, type: 'date' }),
  file: (base) => ({
    ...base,
    type: 'file',
    fileConfig: { maxSizeMb: 10, allowedTypes: ['image', 'pdf'] },
  }),
  statement: (base) => ({ ...base, type: 'statement' }),
};

/**
 * A new, optional question of `type` with a fresh id and an empty label for the builder to
 * fill in. Choice questions start with two options.
 */
export function createField<T extends FieldType>(type: T): FieldOfType<T> {
  return factories[type]({ id: createId('fld'), label: '', required: false });
}

export function createDefaultSettings(): FormSettings {
  return {
    submitButtonText: 'Submit',
    successMessage: 'Thanks! Your response has been recorded.',
  };
}

export function createEmptyForm(): FormSchema {
  return { version: FORM_SCHEMA_VERSION, fields: [], settings: createDefaultSettings() };
}
