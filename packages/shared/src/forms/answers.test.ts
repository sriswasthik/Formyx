import { describe, expect, it } from 'vitest';
import {
  evaluateCondition,
  getVisibleFieldIds,
  isAnswered,
  validateAnswer,
  validateAnswers,
  type AnswerValue,
} from './answers.js';
import type { Condition } from './conditions.js';
import { createEmptyForm, createField } from './factories.js';
import type { Field } from './fields.js';
import type { FormSchema } from './form-schema.js';

const text = createField('short_text');
const number = createField('number');
const rating = createField('rating');
const date = createField('date');
const single = createField('single_choice');
const multi = createField('multi_choice');
const [optionA, optionB] = single.options.map((option) => option.id);
const [multiA, multiB] = multi.options.map((option) => option.id);

describe('isAnswered', () => {
  it.each<[AnswerValue | undefined, boolean]>([
    [undefined, false],
    [null, false],
    ['', false],
    ['   ', false],
    ['x', true],
    [[], false],
    [['a'], true],
    [0, true],
    [Number.NaN, false],
  ])('%j -> %s', (value, expected) => {
    expect(isAnswered(value)).toBe(expected);
  });
});

describe('evaluateCondition', () => {
  const check = (condition: Omit<Condition, 'sourceFieldId'>, source: Field, answer: AnswerValue) =>
    evaluateCondition({ ...condition, sourceFieldId: source.id }, source, answer);

  it('checks whether a question was answered', () => {
    expect(check({ operator: 'is_answered' }, text, 'hi')).toBe(true);
    expect(check({ operator: 'is_answered' }, text, ' ')).toBe(false);
    expect(check({ operator: 'is_not_answered' }, multi, [])).toBe(true);
  });

  it('compares text without regard to case or surrounding spaces', () => {
    expect(check({ operator: 'equals', value: 'Yes' }, text, ' yes ')).toBe(true);
    expect(check({ operator: 'not_equals', value: 'Yes' }, text, 'no')).toBe(true);
    expect(check({ operator: 'contains', value: 'URGENT' }, text, 'this is urgent!')).toBe(true);
    expect(check({ operator: 'contains', value: 'urgent' }, text, 'later')).toBe(false);
  });

  it('compares numbers, ratings and dates in order', () => {
    expect(check({ operator: 'greater_than', value: 10 }, number, 11)).toBe(true);
    expect(check({ operator: 'greater_than', value: 10 }, number, '10')).toBe(false);
    expect(check({ operator: 'less_than', value: 4 }, rating, 3)).toBe(true);
    expect(check({ operator: 'equals', value: 4 }, rating, 4)).toBe(true);
    expect(check({ operator: 'less_than', value: '2026-01-01' }, date, '2025-12-31')).toBe(true);
    expect(check({ operator: 'greater_than', value: '2026-01-01' }, date, '2025-12-31')).toBe(
      false,
    );
  });

  it('matches choices by option id', () => {
    expect(check({ operator: 'equals', value: optionA ?? '' }, single, optionA ?? null)).toBe(true);
    expect(check({ operator: 'not_equals', value: optionA ?? '' }, single, optionB ?? null)).toBe(
      true,
    );
    expect(
      check({ operator: 'contains', value: multiB ?? '' }, multi, [multiA ?? '', multiB ?? '']),
    ).toBe(true);
    expect(check({ operator: 'contains', value: multiB ?? '' }, multi, [multiA ?? ''])).toBe(false);
  });

  it('never matches comparisons against an unanswered question', () => {
    expect(check({ operator: 'not_equals', value: 'Yes' }, text, null)).toBe(false);
    expect(check({ operator: 'less_than', value: 3 }, rating, null)).toBe(false);
  });

  it('leaves conditions without a value undecided', () => {
    expect(check({ operator: 'equals' }, text, 'anything')).toBeNull();
  });
});

describe('getVisibleFieldIds', () => {
  const followUp: Field = {
    ...createField('long_text'),
    conditions: [{ sourceFieldId: single.id, operator: 'equals', value: optionA ?? '' }],
  };
  const nested: Field = {
    ...createField('email'),
    conditions: [{ sourceFieldId: followUp.id, operator: 'is_answered' }],
  };
  const either: Field = {
    ...createField('phone'),
    conditionMatch: 'any',
    conditions: [
      { sourceFieldId: single.id, operator: 'equals', value: optionB ?? '' },
      { sourceFieldId: rating.id, operator: 'less_than', value: 3 },
    ],
  };
  const schema: FormSchema = {
    ...createEmptyForm(),
    fields: [single, rating, followUp, nested, either],
  };

  it('shows unconditional questions and hides those whose conditions fail', () => {
    expect([...getVisibleFieldIds(schema, {})]).toEqual([single.id, rating.id]);
  });

  it('shows follow-ups once their conditions hold', () => {
    const visible = getVisibleFieldIds(schema, {
      [single.id]: optionA ?? null,
      [followUp.id]: 'Details',
    });
    expect(visible).toEqual(new Set([single.id, rating.id, followUp.id, nested.id]));
  });

  it('ignores answers to questions that are hidden', () => {
    const visible = getVisibleFieldIds(schema, {
      [single.id]: optionB ?? null,
      [followUp.id]: 'Left over from before',
    });
    expect(visible.has(nested.id)).toBe(false);
  });

  it('shows a question matching "any" when one condition holds', () => {
    expect(getVisibleFieldIds(schema, { [rating.id]: 2 }).has(either.id)).toBe(true);
    expect(getVisibleFieldIds(schema, { [rating.id]: 5 }).has(either.id)).toBe(false);
  });

  it('shows questions whose conditions are still missing a value', () => {
    const unfinished: Field = {
      ...createField('date'),
      conditions: [{ sourceFieldId: single.id, operator: 'equals' }],
    };
    const form = { ...createEmptyForm(), fields: [single, unfinished] };
    expect(getVisibleFieldIds(form, {}).has(unfinished.id)).toBe(true);
  });
});

describe('validateAnswer', () => {
  it('requires answers to required questions', () => {
    expect(validateAnswer({ ...text, required: true }, '  ')).toBe('This question is required');
    expect(validateAnswer(text, '')).toBeNull();
    expect(validateAnswer(createField('statement'), undefined)).toBeNull();
  });

  it.each<[Field, AnswerValue, string | null]>([
    [{ ...text, validation: { minLength: 3 } }, 'ab', 'Use at least 3 characters'],
    [{ ...text, validation: { maxLength: 1 } }, 'ab', 'Use 1 character or fewer'],
    [{ ...text, validation: { minLength: 2, maxLength: 4 } }, 'abc', null],
    [createField('email'), 'ada@example', 'Enter a valid email address'],
    [createField('email'), ' ada@example.com ', null],
    [createField('phone'), '12', 'Enter a valid phone number'],
    [createField('phone'), '+44 (20) 7946-0958', null],
    [number, 'abc', 'Enter a number'],
    [{ ...number, validation: { min: 1, max: 5 } }, 0, 'Enter a number of at least 1'],
    [{ ...number, validation: { min: 1, max: 5 } }, 6, 'Enter a number of at most 5'],
    [{ ...number, validation: { min: 1, max: 5 } }, '3', null],
    [rating, 6, 'Pick a rating from 1 to 5'],
    [rating, 5, null],
    [date, '2026-02-30', 'Enter a valid date'],
    [date, '2026-02-28', null],
    [single, 'opt_unknown', 'Choose an option'],
    [single, optionB ?? null, null],
    [multi, [multiA ?? '', 'opt_unknown'], 'Choose from the options'],
    [multi, [multiA ?? ''], null],
  ])('%#: %j', (field, value, expected) => {
    expect(validateAnswer(field, value)).toBe(expected);
  });
});

describe('validateAnswers', () => {
  it('reports problems for visible questions only', () => {
    const hiddenRequired: Field = {
      ...createField('short_text'),
      required: true,
      conditions: [{ sourceFieldId: single.id, operator: 'is_answered' }],
    };
    const schema: FormSchema = {
      ...createEmptyForm(),
      fields: [single, { ...createField('email'), required: true }, hiddenRequired],
    };

    const errors = validateAnswers(schema, {});

    expect(Object.values(errors)).toEqual(['This question is required']);
    expect(errors).not.toHaveProperty(hiddenRequired.id);
  });
});
