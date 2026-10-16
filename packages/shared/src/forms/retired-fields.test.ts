import { describe, expect, it } from 'vitest';
import { csvAnswerColumns } from './csv-columns.js';
import { createEmptyForm, createField } from './factories.js';
import type { FormSchema } from './form-schema.js';
import {
  capRetiredFields,
  MAX_RETIRED_FIELDS,
  responseFields,
  retiredFieldsSchema,
  retireFields,
} from './retired-fields.js';

const name = { ...createField('short_text'), label: 'Name' };
const city = { ...createField('short_text'), label: 'City' };
const heading = { ...createField('statement'), label: 'About you' };
const form = (...fields: FormSchema['fields']): FormSchema => ({ ...createEmptyForm(), fields });

describe('retireFields', () => {
  it('retires the questions a publish deletes, but not content blocks', () => {
    expect(retireFields(form(name, city, heading), form(name), [])).toEqual({
      kept: [],
      added: [city],
    });
  });

  it('keeps questions deleted before, unless they come back', () => {
    const older = { ...createField('email'), label: 'Email' };

    expect(retireFields(form(name, city), form(name, city), [older])).toEqual({
      kept: [older],
      added: [],
    });
    expect(retireFields(form(name), form(name, city), [city])).toEqual({ kept: [], added: [] });
  });

  it('retires nothing on a first publish', () => {
    expect(retireFields(null, form(name), [])).toEqual({ kept: [], added: [] });
  });
});

describe('responseFields', () => {
  it('lists the form’s questions, then deleted ones marked as deleted', () => {
    expect(responseFields(form(heading, name), [city]).map((field) => field.label)).toEqual([
      'Name',
      'City (deleted question)',
    ]);
  });

  it('gives deleted questions their export columns, after the live ones', () => {
    expect(csvAnswerColumns(form(name), [city]).map((column) => column.header)).toEqual([
      'Name',
      'City (deleted question)',
    ]);
  });
});

describe('stored deleted questions', () => {
  it('drops only the entries that no longer read', () => {
    expect(retiredFieldsSchema.parse([city, { type: 'hologram', id: 'x' }])).toEqual([city]);
    expect(retiredFieldsSchema.parse('nonsense')).toEqual([]);
  });

  it('keeps the most recently deleted when there are too many', () => {
    const many = Array.from({ length: MAX_RETIRED_FIELDS + 5 }, (_, index) => ({
      ...createField('short_text'),
      label: `Question ${index}`,
    }));

    const kept = capRetiredFields(many);
    expect(kept).toHaveLength(MAX_RETIRED_FIELDS);
    expect(kept.at(-1)).toBe(many.at(-1));
  });
});
