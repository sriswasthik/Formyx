import { describe, expect, it } from 'vitest';
import { createEmptyForm, createField } from './factories.js';
import { FIELD_TYPES } from './field-types.js';
import { fieldSchema } from './fields.js';

describe('createField', () => {
  it.each(FIELD_TYPES.filter((type) => type !== 'consent' && type !== 'hidden'))(
    'creates a valid, optional %s question',
    (type) => {
      const field = createField(type);

      expect(fieldSchema.parse(field)).toEqual(field);
      expect(field).toMatchObject({ type, label: '', required: false });
      expect(field.id).toMatch(/^fld_[a-z0-9]{10}$/);
    },
  );

  it('starts consent required and hidden fields named, ready to publish', () => {
    const consent = createField('consent');
    expect(fieldSchema.parse(consent)).toEqual(consent);
    expect(consent).toMatchObject({ required: true, label: 'I agree to the terms' });
    const hidden = createField('hidden');
    expect(fieldSchema.parse(hidden)).toEqual(hidden);
    expect(hidden).toMatchObject({ required: false, label: 'Source', paramName: 'source' });
  });

  it('gives every question and option a fresh id', () => {
    const a = createField('single_choice');
    const b = createField('single_choice');

    expect(a.id).not.toBe(b.id);
    expect(a.options.map((option) => option.label)).toEqual(['Option 1', 'Option 2']);
    expect(new Set([...a.options, ...b.options].map((option) => option.id)).size).toBe(4);
  });

  it('uses sensible defaults for rating and file questions', () => {
    expect(createField('rating').ratingScale).toBe(5);
    expect(createField('file').fileConfig).toEqual({
      maxSizeMb: 10,
      allowedTypes: ['image', 'pdf'],
    });
  });
});

describe('createEmptyForm', () => {
  it('has no questions and default settings', () => {
    const form = createEmptyForm();
    expect(form).toMatchObject({
      version: 3,
      fields: [],
      settings: { submitButtonText: 'Submit', saveProgress: 'browser' },
      logic: { pages: {}, variables: [], rules: [] },
    });
    // One end screen, the default, thanking respondents.
    expect(form.logic.endScreens).toEqual([
      expect.objectContaining({
        id: 'end_default',
        message: 'Thanks! Your response has been recorded.',
        when: [],
      }),
    ]);
  });
});
