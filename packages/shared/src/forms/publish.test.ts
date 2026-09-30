import { describe, expect, it } from 'vitest';
import { createEmptyForm, createField, createOption } from './factories.js';
import type { Field } from './fields.js';
import type { FormSchema } from './form-schema.js';
import { findPublishIssues, isSameFormSchema, responseLimitReached } from './publish.js';
import { getFormTemplate } from './templates.js';

function form(...fields: Field[]): FormSchema {
  return { ...createEmptyForm(), fields };
}

const named = <T extends Field>(field: T, label = 'A question'): T => ({ ...field, label });

describe('findPublishIssues', () => {
  it.each(['blank', 'event_registration', 'feedback_survey'] as const)(
    'finds nothing wrong with the %s template once it has a question',
    (id) => {
      const schema = getFormTemplate(id).build();
      const ready = schema.fields.length > 0 ? schema : form(named(createField('short_text')));
      expect(findPublishIssues(ready)).toEqual([]);
    },
  );

  it('needs at least one question that takes an answer', () => {
    const message = 'Add at least one question that takes an answer';
    expect(findPublishIssues(form())).toEqual([{ path: 'fields', message }]);
    expect(findPublishIssues(form(named(createField('statement'), 'Hello')))).toEqual([
      { path: 'fields', message },
    ]);
  });

  it('needs every question and statement to be written', () => {
    const issues = findPublishIssues(
      form(
        named(createField('email')),
        { ...createField('number'), label: '  ' },
        createField('statement'),
      ),
    );
    expect(issues).toEqual([
      { path: 'fields.1.label', message: 'Write the question' },
      { path: 'fields.2.label', message: 'Write the text' },
    ]);
  });

  it('needs options on choice questions, each with a name', () => {
    const noOptions = { ...named(createField('dropdown')), options: [] };
    const unnamed = {
      ...named(createField('multi_choice')),
      options: [createOption('Yes'), createOption(' ')],
    };
    expect(findPublishIssues(form(noOptions, unnamed))).toEqual([
      { path: 'fields.0.options', message: 'Add at least one option' },
      { path: 'fields.1.options.1.label', message: 'Name this option' },
    ]);
  });

  it('needs a value on every condition that compares', () => {
    const source = named(createField('short_text'));
    const follow: Field = {
      ...named(createField('email')),
      conditions: [
        { sourceFieldId: source.id, operator: 'equals' },
        { sourceFieldId: source.id, operator: 'contains', value: '  ' },
        { sourceFieldId: source.id, operator: 'is_answered' },
      ],
    };
    expect(findPublishIssues(form(source, follow))).toEqual([
      { path: 'fields.1.conditions.0.value', message: 'Choose a value for this condition' },
      { path: 'fields.1.conditions.1.value', message: 'Choose a value for this condition' },
    ]);
  });
});

describe('isSameFormSchema', () => {
  const schema = getFormTemplate('feedback_survey').build();

  it('ignores the order of object keys, as Postgres jsonb reorders them', () => {
    const reordered = JSON.parse(
      JSON.stringify(schema, (_key, value: unknown) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse())
          : value,
      ),
    ) as FormSchema;
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(schema));
    expect(isSameFormSchema(schema, reordered)).toBe(true);
  });

  it('ignores properties that are undefined', () => {
    expect(isSameFormSchema({ ...schema, description: undefined }, schema)).toBe(true);
  });

  it('notices real changes, including the order of questions', () => {
    expect(isSameFormSchema({ ...schema, description: 'New' }, schema)).toBe(false);
    expect(isSameFormSchema({ ...schema, fields: [...schema.fields].reverse() }, schema)).toBe(
      false,
    );
  });

  it('treats a missing snapshot as different from any schema', () => {
    expect(isSameFormSchema(schema, null)).toBe(false);
    expect(isSameFormSchema(null, null)).toBe(true);
  });
});

describe('responseLimitReached', () => {
  const settings = createEmptyForm().settings;
  const now = new Date('2026-09-30T12:00:00Z');

  it('never closes a form without limits', () => {
    expect(responseLimitReached(settings, 1_000_000, now)).toBeNull();
  });

  it('closes once the response limit is reached', () => {
    const limited = { ...settings, closeAfterResponses: 100 };
    expect(responseLimitReached(limited, 99, now)).toBeNull();
    expect(responseLimitReached(limited, 100, now)).toBe('response_limit');
  });

  it('closes at the closing time, whatever the time zone it was written in', () => {
    const dated = { ...settings, closeAt: '2026-09-30T14:00:00+02:00' };
    expect(responseLimitReached(dated, 0, new Date('2026-09-30T11:59:59Z'))).toBeNull();
    expect(responseLimitReached(dated, 0, now)).toBe('close_date');
  });
});
