import { describe, expect, it } from 'vitest';
import { toValidationIssues } from '../errors.js';
import type { Condition } from './conditions.js';
import { createEmptyForm, createField } from './factories.js';
import { createDefaultLogic } from './logic-factories.js';
import { FIELD_TYPES } from './field-types.js';
import type { Field } from './fields.js';
import { formSchema, type FormSchema } from './form-schema.js';

function formWith(...fields: Field[]): FormSchema {
  return { ...createEmptyForm(), fields };
}

/** `path -> message` pairs for an invalid form, or `null` when it is valid. */
function issues(form: unknown) {
  const result = formSchema.safeParse(form);
  return result.success ? null : toValidationIssues(result.error);
}

function withCondition(field: Field, condition: Condition): Field {
  return { ...field, conditions: [condition] };
}

describe('formSchema: valid forms', () => {
  it('accepts an empty form', () => {
    expect(issues(createEmptyForm())).toBeNull();
  });

  it('accepts a default question of every type', () => {
    const form = formWith(...FIELD_TYPES.map((type) => createField(type)));
    expect(issues(form)).toBeNull();
  });

  it('accepts unfinished drafts: empty labels, no options, conditions without a value', () => {
    const choice = { ...createField('single_choice'), options: [] };
    const text = createField('short_text');
    const dependent = withCondition(createField('long_text'), {
      sourceFieldId: text.id,
      operator: 'equals',
    });

    expect(issues(formWith(choice, text, dependent))).toBeNull();
  });

  it('reads forms saved with the retired notifyOnSubmit setting, and drops it', () => {
    const stored = {
      ...createEmptyForm(),
      settings: { ...createEmptyForm().settings, notifyOnSubmit: true },
    };
    expect(formSchema.parse(stored).settings).not.toHaveProperty('notifyOnSubmit');
  });

  it('accepts a fully configured form', () => {
    const rating = { ...createField('rating'), label: 'How was it?', required: true };
    const choice = createField('single_choice');
    const optionId = choice.options[0]?.id ?? '';
    const form: FormSchema = {
      version: 3,
      fields: [
        rating,
        choice,
        {
          ...createField('short_text'),
          label: 'Why?',
          validation: { minLength: 2, maxLength: 200 },
          conditionMatch: 'any',
          conditions: [
            { sourceFieldId: rating.id, operator: 'less_than', value: 3 },
            { sourceFieldId: choice.id, operator: 'equals', value: optionId },
          ],
        },
        { ...createField('number'), validation: { min: 0, max: 0 } },
        { ...createField('file'), fileConfig: { maxSizeMb: 25, allowedTypes: ['pdf'] } },
      ],
      settings: {
        submitButtonText: 'Send',
        saveProgress: 'email',
        closeAfterResponses: 100,
        closeAt: '2026-12-31T23:59:00+01:00',
      },
      logic: createDefaultLogic(),
    };

    expect(issues(form)).toBeNull();
  });

  it('drops keys that do not belong to a question type', () => {
    const stale = { ...createField('short_text'), options: [{ id: 'o1', label: 'A' }] };
    const parsed = formSchema.parse(formWith(stale));
    expect(parsed.fields[0]).not.toHaveProperty('options');
  });
});

describe('formSchema: invalid forms', () => {
  it('rejects other versions and missing parts', () => {
    expect(issues({ ...createEmptyForm(), version: 1 })?.[0]?.path).toBe('version');
    expect(issues({ version: 3, fields: [] })?.map((issue) => issue.path)).toEqual([
      'settings',
      'logic',
    ]);
    expect(issues(null)).not.toBeNull();
  });

  it('rejects unknown question types', () => {
    const unknown = { ...createField('short_text'), type: 'hologram' };
    expect(issues(formWith(unknown as unknown as Field))?.[0]?.path).toBe('fields.0.type');
  });

  it('rejects duplicate question and option ids', () => {
    const first = createField('dropdown');
    const second = { ...createField('email'), id: first.id };
    const duplicatedOption = {
      ...first,
      options: [
        { id: 'opt_a', label: 'A' },
        { id: 'opt_a', label: 'B' },
      ],
    };

    expect(issues(formWith(duplicatedOption, second))).toEqual([
      { path: 'fields.0.options.1.id', message: 'Another option already uses this id' },
      { path: 'fields.1.id', message: 'Another question already uses this id' },
    ]);
  });

  it('rejects ids with unsafe characters', () => {
    const field = { ...createField('date'), id: 'has spaces' };
    expect(issues(formWith(field))?.[0]?.path).toBe('fields.0.id');
  });

  it.each([2, 11, 4.5])('rejects a rating scale of %d', (ratingScale) => {
    const field = { ...createField('rating'), ratingScale };
    expect(issues(formWith(field))).toEqual([
      {
        path: 'fields.0.ratingScale',
        message: 'Use a whole number from 3 to 10',
      },
    ]);
  });

  it('rejects a minimum above the maximum', () => {
    const text = { ...createField('short_text'), validation: { minLength: 10, maxLength: 5 } };
    const number = { ...createField('number'), validation: { min: 5, max: 1 } };

    expect(issues(formWith(text, number))).toEqual([
      { path: 'fields.0.validation.maxLength', message: 'Must be at least the minimum length' },
      { path: 'fields.1.validation.max', message: 'Must be at least the minimum' },
    ]);
  });

  it('rejects negative lengths and oversized files', () => {
    const text = { ...createField('long_text'), validation: { minLength: -1 } };
    const file = { ...createField('file'), fileConfig: { maxSizeMb: 26, allowedTypes: [] } };

    expect(issues(formWith(text, file))?.map((issue) => issue.path)).toEqual([
      'fields.0.validation.minLength',
      'fields.1.fileConfig.maxSizeMb',
      'fields.1.fileConfig.allowedTypes',
    ]);
  });

  it('rejects a required statement', () => {
    const statement = { ...createField('statement'), required: true };
    expect(issues(formWith(statement as unknown as Field))).toEqual([
      { path: 'fields.0.required', message: 'Statements cannot be required' },
    ]);
  });

  it('rejects empty settings and invalid close dates', () => {
    const form = {
      ...createEmptyForm(),
      settings: {
        submitButtonText: '  ',
        saveProgress: 'sometimes',
        closeAt: 'next friday',
      },
    };
    expect(issues(form)?.map((issue) => issue.path)).toEqual([
      'settings.submitButtonText',
      'settings.saveProgress',
      'settings.closeAt',
    ]);
  });
});

describe('formSchema: conditions', () => {
  const text = createField('short_text');
  const number = createField('number');
  const rating = createField('rating');
  const date = createField('date');
  const choice = createField('multi_choice');
  const statement = createField('statement');

  function conditionIssues(condition: Condition, sources: Field[] = [text]) {
    return issues(formWith(...sources, withCondition(createField('long_text'), condition)));
  }

  it('rejects a question that does not exist', () => {
    expect(conditionIssues({ sourceFieldId: 'fld_missing', operator: 'is_answered' })).toEqual([
      {
        path: 'fields.1.conditions.0.sourceFieldId',
        message: 'Refers to a question that does not exist',
      },
    ]);
  });

  it('rejects depending on itself or on a later question', () => {
    const self = withCondition(text, { sourceFieldId: text.id, operator: 'is_answered' });
    const later = createField('email');
    const early = withCondition(createField('phone'), {
      sourceFieldId: later.id,
      operator: 'is_answered',
    });

    expect(issues(formWith(self, early, later))).toEqual([
      {
        path: 'fields.0.conditions.0.sourceFieldId',
        message: 'A question cannot depend on itself',
      },
      {
        path: 'fields.1.conditions.0.sourceFieldId',
        message: 'Can only depend on an earlier question',
      },
    ]);
  });

  it('rejects statements as a source', () => {
    expect(
      conditionIssues({ sourceFieldId: statement.id, operator: 'is_answered' }, [statement]),
    ).toEqual([
      {
        path: 'fields.1.conditions.0.sourceFieldId',
        message: 'Content blocks have no answer to check',
      },
    ]);
  });

  it.each([
    [text, 'greater_than', '"is greater than" does not apply to short text questions'],
    [number, 'contains', '"contains" does not apply to number questions'],
    [choice, 'equals', '"is" does not apply to multiple choice questions'],
  ] as const)('rejects operators that do not fit the source (%#)', (source, operator, message) => {
    expect(conditionIssues({ sourceFieldId: source.id, operator, value: 1 }, [source])).toEqual([
      { path: 'fields.1.conditions.0.operator', message },
    ]);
  });

  it.each([
    [number, 'abc', 'Enter a number'],
    [rating, 0, 'Pick a rating from 1 to 5'],
    [rating, 6, 'Pick a rating from 1 to 5'],
    [rating, 2.5, 'Pick a rating from 1 to 5'],
    [date, '30/09/2026', 'Use a date such as 2026-09-30'],
    [date, '2026-02-30', 'Use a date such as 2026-09-30'],
    [text, 42, 'Enter text'],
    [choice, 'opt_unknown', "Pick one of the question's options"],
  ] as const)('rejects values that do not fit the source (%#)', (source, value, message) => {
    const operator = source === text ? 'equals' : source === choice ? 'contains' : 'less_than';
    expect(conditionIssues({ sourceFieldId: source.id, operator, value }, [source])).toEqual([
      { path: 'fields.1.conditions.0.value', message },
    ]);
  });

  it.each([
    [number, 'greater_than', 10],
    [rating, 'equals', 5],
    [date, 'less_than', '2024-02-29'],
    [text, 'contains', 'urgent'],
    [choice, 'contains', choice.options[1]?.id ?? ''],
  ] as const)('accepts matching values (%#)', (source, operator, value) => {
    expect(conditionIssues({ sourceFieldId: source.id, operator, value }, [source])).toBeNull();
  });

  it('ignores values on operators that do not use one', () => {
    expect(
      conditionIssues({ sourceFieldId: number.id, operator: 'is_not_answered', value: 'x' }, [
        number,
      ]),
    ).toBeNull();
  });
});
