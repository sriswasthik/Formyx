import type { FieldType } from './field-types.js';
import type { FieldOfType, FieldOption } from './fields.js';
import { FORM_SCHEMA_VERSION, type FormSettings } from './form-schema-shape.js';
import type { FormSchema } from './form-schema.js';
import { createId } from './ids.js';
import { createDefaultLogic } from './logic-factories.js';
import { DEFAULT_PHONE_COUNTRY } from './phone.js';

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
  phone: (base) => ({ ...base, type: 'phone', defaultCountry: DEFAULT_PHONE_COUNTRY }),
  single_choice: (base) => ({ ...base, type: 'single_choice', options: defaultOptions() }),
  multi_choice: (base) => ({ ...base, type: 'multi_choice', options: defaultOptions() }),
  dropdown: (base) => ({ ...base, type: 'dropdown', options: defaultOptions() }),
  rating: (base) => ({ ...base, type: 'rating', ratingScale: 5, ratingStyle: 'stars' }),
  date: (base) => ({ ...base, type: 'date' }),
  file: (base) => ({
    ...base,
    type: 'file',
    fileConfig: { maxSizeMb: 10, allowedTypes: ['image', 'pdf'] },
  }),
  statement: (base) => ({ ...base, type: 'statement' }),
  picture_choice: (base) => ({
    ...base,
    type: 'picture_choice',
    options: defaultOptions(),
    multiple: false,
  }),
  yes_no: (base) => ({ ...base, type: 'yes_no' }),
  nps: (base) => ({
    ...base,
    type: 'nps',
    lowLabel: 'Not at all likely',
    highLabel: 'Extremely likely',
  }),
  opinion_scale: (base) => ({
    ...base,
    type: 'opinion_scale',
    start: 1,
    end: 5,
    lowLabel: 'Strongly disagree',
    middleLabel: '',
    highLabel: 'Strongly agree',
  }),
  slider: (base) => ({ ...base, type: 'slider', min: 0, max: 100, step: 1, unit: '' }),
  ranking: (base) => ({
    ...base,
    type: 'ranking',
    options: [createOption('Option 1'), createOption('Option 2'), createOption('Option 3')],
  }),
  matrix: (base) => ({
    ...base,
    type: 'matrix',
    rows: [createOption('Row 1'), createOption('Row 2')],
    columns: [createOption('Poor'), createOption('Fair'), createOption('Good')],
    multiple: false,
  }),
  address: (base) => ({ ...base, type: 'address' }),
  time: (base) => ({ ...base, type: 'time' }),
  date_range: (base) => ({ ...base, type: 'date_range' }),
  url: (base) => ({ ...base, type: 'url' }),
  currency: (base) => ({ ...base, type: 'currency', currency: 'INR' }),
  signature: (base) => ({ ...base, type: 'signature' }),
  color: (base) => ({ ...base, type: 'color' }),
  image: (base) => ({ ...base, type: 'image', alt: '', width: 'full' }),
  video: (base) => ({ ...base, type: 'video', videoUrl: '' }),
  divider: (base) => ({ ...base, type: 'divider' }),
  page_break: (base) => ({ ...base, type: 'page_break' }),
  // Agreeing is the point of a consent question, so it starts required.
  consent: (base) => ({
    ...base,
    type: 'consent',
    label: 'I agree to the terms',
    required: true,
    terms: '',
  }),
  hidden: (base) => ({ ...base, type: 'hidden', label: 'Source', paramName: 'source' }),
  voice_note: (base) => ({ ...base, type: 'voice_note', maxDurationSeconds: 60 }),
};

/**
 * A new, optional question of `type` with a fresh id and an empty label for the builder to
 * fill in. Choice questions start with two options.
 */
export function createField<T extends FieldType>(type: T): FieldOfType<T> {
  return factories[type]({ id: createId('fld'), label: '', required: false });
}

export function createDefaultSettings(): FormSettings {
  return { submitButtonText: 'Submit', saveProgress: 'browser' };
}

export function createEmptyForm(): FormSchema {
  return {
    version: FORM_SCHEMA_VERSION,
    fields: [],
    settings: createDefaultSettings(),
    logic: createDefaultLogic(),
  };
}
