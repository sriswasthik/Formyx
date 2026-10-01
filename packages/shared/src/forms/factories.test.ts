import { describe, expect, it } from 'vitest';
import { createEmptyForm, createField } from './factories.js';
import { FIELD_TYPES } from './field-types.js';
import { fieldSchema } from './fields.js';
import { createDefaultTheme, formThemeSchema } from './theme.js';

describe('createField', () => {
  it.each(FIELD_TYPES)('creates a valid, optional %s question', (type) => {
    const field = createField(type);

    expect(fieldSchema.parse(field)).toEqual(field);
    expect(field).toMatchObject({ type, label: '', required: false });
    expect(field.id).toMatch(/^fld_[a-z0-9]{10}$/);
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
    expect(createEmptyForm()).toEqual({
      version: 1,
      fields: [],
      settings: {
        submitButtonText: 'Submit',
        successMessage: 'Thanks! Your response has been recorded.',
      },
    });
  });
});

describe('formThemeSchema', () => {
  it('accepts the default theme', () => {
    expect(formThemeSchema.parse(createDefaultTheme())).toEqual(createDefaultTheme());
  });

  it.each([
    [{ accentColor: 'blue' }, 'accentColor'],
    [{ accentColor: '#2E5AA' }, 'accentColor'],
    [{ font: 'comic-sans' }, 'font'],
    [{ radius: 'huge' }, 'radius'],
    [{ logoUrl: 'http://example.com/logo.png' }, 'logoUrl'],
    [{ coverUrl: 'javascript:alert(1)' }, 'coverUrl'],
  ])('rejects %j', (override, path) => {
    const result = formThemeSchema.safeParse({ ...createDefaultTheme(), ...override });
    expect(result.error?.issues[0]?.path).toEqual([path]);
  });

  it('accepts https images', () => {
    const theme = { ...createDefaultTheme(), logoUrl: 'https://cdn.example.com/logo.png' };
    expect(formThemeSchema.safeParse(theme).success).toBe(true);
  });
});
