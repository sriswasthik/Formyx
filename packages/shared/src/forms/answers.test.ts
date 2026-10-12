import { describe, expect, it } from 'vitest';
import { sanitizeAnswers } from '../logic/navigation.js';
import { evaluateCondition, evaluateVisibility, isAnswered, type AnswerValue } from './answers.js';
import { OPERATORS_BY_FIELD_TYPE, type Condition, type ConditionOperator } from './conditions.js';
import { createEmptyForm, createField } from './factories.js';
import { FIELD_TYPES, type FieldType } from './field-types.js';
import type { Field, FieldOfType } from './fields.js';
import type { FormSchema } from './form-schema.js';

const text = createField('short_text');
const number = createField('number');
const rating = createField('rating');
const date = createField('date');
const single = createField('single_choice');
const multi = createField('multi_choice');
const [optionA = '', optionB = ''] = single.options.map((option) => option.id);
const [multiA = ''] = multi.options.map((option) => option.id);

function form(...fields: Field[]): FormSchema {
  return { ...createEmptyForm(), fields };
}

function showWhen(field: Field, ...conditions: Condition[]): Field {
  return { ...field, conditions };
}

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
    [true, true],
    [false, false],
    [{ start: '', end: '' }, false],
    [{ r1: [] }, false],
    [{ r1: 'c1' }, true],
  ])('%j -> %s', (value, expected) => {
    expect(isAnswered(value)).toBe(expected);
  });
});

describe('evaluateCondition', () => {
  const sources: Record<FieldType, Field> = Object.fromEntries(
    FIELD_TYPES.map((type) => [type, createField(type)]),
  ) as Record<FieldType, Field>;
  const choice = sources.single_choice as typeof single;
  const dropdown = sources.dropdown as typeof single;
  const checkboxes = sources.multi_choice as typeof multi;
  const [choiceYes = '', choiceNo = ''] = choice.options.map((option) => option.id);
  const [dropYes = '', dropNo = ''] = dropdown.options.map((option) => option.id);
  const [boxA = '', boxB = ''] = checkboxes.options.map((option) => option.id);
  const pictures = sources.picture_choice as FieldOfType<'picture_choice'>;
  const [picA = '', picB = ''] = pictures.options.map((option) => option.id);
  const address = { line1: '1 MG Road', pin: '560001', city: 'Bengaluru', state: 'Karnataka' };

  type Case = [
    type: FieldType,
    operator: ConditionOperator,
    value: string | number | undefined,
    answer: AnswerValue,
    expected: boolean,
  ];

  // Every operator each question type offers, with a case that holds and one that does not.
  const cases: Case[] = [
    ...(['short_text', 'long_text', 'email', 'phone', 'url', 'hidden'] as const).flatMap(
      (type): Case[] => [
        [type, 'equals', 'Yes', ' yes ', true],
        [type, 'equals', 'Yes', 'no', false],
        [type, 'not_equals', 'Yes', 'no', true],
        [type, 'not_equals', 'Yes', 'YES', false],
        [type, 'contains', 'URGENT', 'this is urgent!', true],
        [type, 'contains', 'urgent', 'later', false],
        [type, 'is_answered', undefined, 'x', true],
        [type, 'is_answered', undefined, '  ', false],
        [type, 'is_not_answered', undefined, null, true],
        [type, 'is_not_answered', undefined, 'x', false],
      ],
    ),
    ...(['number', 'rating', 'nps', 'opinion_scale', 'slider', 'currency'] as const).flatMap(
      (type): Case[] => [
        [type, 'equals', 4, 4, true],
        [type, 'equals', 4, 3, false],
        [type, 'not_equals', 4, 3, true],
        [type, 'not_equals', 4, 4, false],
        [type, 'greater_than', 3, 4, true],
        [type, 'greater_than', 3, 3, false],
        [type, 'less_than', 3, 2, true],
        [type, 'less_than', 3, 3, false],
        [type, 'is_answered', undefined, 0, true],
        [type, 'is_answered', undefined, null, false],
        [type, 'is_not_answered', undefined, null, true],
        [type, 'is_not_answered', undefined, 1, false],
      ],
    ),
    // Number inputs hold text until submitted, so conditions read numbers from strings too.
    ['number', 'greater_than', 10, '11', true],
    ['number', 'equals', 10, '10.0', true],
    ['date', 'equals', '2026-09-30', '2026-09-30', true],
    ['date', 'equals', '2026-09-30', '2026-10-01', false],
    ['date', 'not_equals', '2026-09-30', '2026-10-01', true],
    ['date', 'not_equals', '2026-09-30', '2026-09-30', false],
    ['date', 'greater_than', '2026-01-01', '2026-01-02', true],
    ['date', 'greater_than', '2026-01-01', '2025-12-31', false],
    ['date', 'less_than', '2026-01-01', '2025-12-31', true],
    ['date', 'less_than', '2026-01-01', '2026-01-01', false],
    ['date', 'is_answered', undefined, '2026-01-01', true],
    ['date', 'is_not_answered', undefined, '2026-01-01', false],
    ['single_choice', 'equals', choiceYes, choiceYes, true],
    ['single_choice', 'equals', choiceYes, choiceNo, false],
    ['single_choice', 'not_equals', choiceYes, choiceNo, true],
    ['single_choice', 'not_equals', choiceYes, choiceYes, false],
    ['single_choice', 'is_answered', undefined, choiceNo, true],
    ['single_choice', 'is_not_answered', undefined, null, true],
    ['dropdown', 'equals', dropYes, dropYes, true],
    ['dropdown', 'equals', dropYes, dropNo, false],
    ['dropdown', 'not_equals', dropYes, dropNo, true],
    ['dropdown', 'not_equals', dropYes, dropYes, false],
    ['dropdown', 'is_answered', undefined, dropNo, true],
    ['dropdown', 'is_not_answered', undefined, dropNo, false],
    ['multi_choice', 'contains', boxB, [boxA, boxB], true],
    ['multi_choice', 'contains', boxB, [boxA], false],
    ['multi_choice', 'is_answered', undefined, [boxA], true],
    ['multi_choice', 'is_answered', undefined, [], false],
    ['multi_choice', 'is_not_answered', undefined, [], true],
    ['multi_choice', 'is_not_answered', undefined, [boxA], false],
    ['time', 'equals', '09:30', '09:30', true],
    ['time', 'equals', '09:30', '10:30', false],
    ['time', 'not_equals', '09:30', '10:30', true],
    ['time', 'not_equals', '09:30', '09:30', false],
    ['time', 'greater_than', '09:30', '18:00', true],
    ['time', 'greater_than', '09:30', '08:00', false],
    ['time', 'less_than', '09:30', '08:00', true],
    ['time', 'less_than', '09:30', '09:30', false],
    ['time', 'is_answered', undefined, '09:30', true],
    ['time', 'is_not_answered', undefined, '09:30', false],
    ['yes_no', 'equals', 'yes', 'yes', true],
    ['yes_no', 'equals', 'yes', 'no', false],
    ['yes_no', 'not_equals', 'yes', 'no', true],
    ['yes_no', 'not_equals', 'yes', 'yes', false],
    ['yes_no', 'is_answered', undefined, 'no', true],
    ['yes_no', 'is_not_answered', undefined, null, true],
    ['picture_choice', 'equals', picA, picA, true],
    ['picture_choice', 'equals', picA, [picA], true],
    ['picture_choice', 'equals', picA, [picA, picB], false],
    ['picture_choice', 'not_equals', picA, picB, true],
    ['picture_choice', 'not_equals', picA, picA, false],
    ['picture_choice', 'contains', picB, [picA, picB], true],
    ['picture_choice', 'contains', picB, [picA], false],
    ['picture_choice', 'is_answered', undefined, picA, true],
    ['picture_choice', 'is_not_answered', undefined, null, true],
    ...(['file', 'signature', 'voice_note'] as const).flatMap((type): Case[] => [
      [type, 'is_answered', undefined, 'cv.pdf', true],
      [type, 'is_not_answered', undefined, 'cv.pdf', false],
      [type, 'is_not_answered', undefined, null, true],
    ]),
    ['ranking', 'is_answered', undefined, ['a', 'b'], true],
    ['ranking', 'is_not_answered', undefined, [], true],
    ['matrix', 'is_answered', undefined, { r1: 'c1' }, true],
    ['matrix', 'is_not_answered', undefined, {}, true],
    ['address', 'is_answered', undefined, address, true],
    [
      'address',
      'is_not_answered',
      undefined,
      { ...address, line1: '', pin: '', city: '', state: '' },
      true,
    ],
    ['date_range', 'is_answered', undefined, { start: '2026-01-01', end: '2026-01-02' }, true],
    ['date_range', 'is_not_answered', undefined, { start: '', end: '' }, true],
    ['color', 'is_answered', undefined, '#112233', true],
    ['color', 'is_not_answered', undefined, '', true],
    ['consent', 'is_answered', undefined, true, true],
    ['consent', 'is_not_answered', undefined, false, true],
  ];

  it.each(cases)('%s %s %j with answer %j -> %s', (type, operator, value, answer, expected) => {
    const source = sources[type];
    const condition: Condition = { sourceFieldId: source.id, operator, value };
    expect(evaluateCondition(condition, source, answer)).toBe(expected);
  });

  it('covers every operator of every question type', () => {
    const covered = new Set(cases.map(([type, operator]) => `${type}:${operator}`));
    const offered = FIELD_TYPES.flatMap((type) =>
      OPERATORS_BY_FIELD_TYPE[type].map((operator) => `${type}:${operator}`),
    );
    expect(offered.filter((pair) => !covered.has(pair))).toEqual([]);
  });

  it('never matches comparisons against an unanswered question', () => {
    const check = (source: Field, operator: ConditionOperator, value: string | number) =>
      evaluateCondition({ sourceFieldId: source.id, operator, value }, source, null);
    expect(check(text, 'not_equals', 'Yes')).toBe(false);
    expect(check(text, 'contains', 'a')).toBe(false);
    expect(check(rating, 'less_than', 3)).toBe(false);
    expect(check(date, 'greater_than', '2026-01-01')).toBe(false);
    expect(check(single, 'not_equals', optionA)).toBe(false);
  });

  it('never matches numbers it cannot read', () => {
    const condition: Condition = { sourceFieldId: number.id, operator: 'less_than', value: 5 };
    expect(evaluateCondition(condition, number, 'abc')).toBe(false);
  });

  it('leaves conditions without a value undecided', () => {
    const condition: Condition = { sourceFieldId: text.id, operator: 'equals' };
    expect(evaluateCondition(condition, text, 'anything')).toBeNull();
  });
});

describe('evaluateVisibility', () => {
  const followUp = showWhen(createField('long_text'), {
    sourceFieldId: single.id,
    operator: 'equals',
    value: optionA,
  });
  const nested = showWhen(createField('email'), {
    sourceFieldId: followUp.id,
    operator: 'is_answered',
  });
  const either: Field = {
    ...createField('phone'),
    conditionMatch: 'any',
    conditions: [
      { sourceFieldId: single.id, operator: 'equals', value: optionB },
      { sourceFieldId: rating.id, operator: 'less_than', value: 3 },
    ],
  };
  const schema = form(single, rating, followUp, nested, either);

  it('shows unconditional questions and hides those whose conditions fail', () => {
    expect([...evaluateVisibility(schema, {})]).toEqual([single.id, rating.id]);
  });

  it('shows follow-ups once their conditions hold', () => {
    const visible = evaluateVisibility(schema, { [single.id]: optionA, [followUp.id]: 'Details' });
    expect(visible).toEqual(new Set([single.id, rating.id, followUp.id, nested.id]));
  });

  it('ignores answers to questions that are hidden', () => {
    const visible = evaluateVisibility(schema, {
      [single.id]: optionB,
      [followUp.id]: 'Left over from before',
    });
    expect(visible.has(followUp.id)).toBe(false);
    expect(visible.has(nested.id)).toBe(false);
  });

  it('shows a question matching "any" when one condition holds', () => {
    expect(evaluateVisibility(schema, { [rating.id]: 2 }).has(either.id)).toBe(true);
    expect(evaluateVisibility(schema, { [single.id]: optionB }).has(either.id)).toBe(true);
    expect(evaluateVisibility(schema, { [rating.id]: 5 }).has(either.id)).toBe(false);
  });

  it('needs every condition to hold when matching "all"', () => {
    const both = showWhen(
      createField('date'),
      { sourceFieldId: single.id, operator: 'equals', value: optionA },
      { sourceFieldId: rating.id, operator: 'greater_than', value: 3 },
    );
    const withBoth = form(single, rating, both);
    expect(evaluateVisibility(withBoth, { [single.id]: optionA }).has(both.id)).toBe(false);
    expect(
      evaluateVisibility(withBoth, { [single.id]: optionA, [rating.id]: 4 }).has(both.id),
    ).toBe(true);
  });

  describe('chains of conditions', () => {
    // role -> company (when role is "employed") -> work email (when company is answered)
    //      -> team size (when work email contains "@corp")
    const role = createField('single_choice');
    const [employed = '', student = ''] = role.options.map((option) => option.id);
    const company = showWhen(createField('short_text'), {
      sourceFieldId: role.id,
      operator: 'equals',
      value: employed,
    });
    const workEmail = showWhen(createField('email'), {
      sourceFieldId: company.id,
      operator: 'is_answered',
    });
    const teamSize = showWhen(createField('number'), {
      sourceFieldId: workEmail.id,
      operator: 'contains',
      value: '@corp',
    });
    const chain = form(role, company, workEmail, teamSize);
    const answered = {
      [role.id]: employed,
      [company.id]: 'Acme',
      [workEmail.id]: 'ada@corp.example',
    };

    it('reveals each link as the one before it is answered', () => {
      expect(evaluateVisibility(chain, answered)).toEqual(
        new Set([role.id, company.id, workEmail.id, teamSize.id]),
      );
    });

    it('hides the whole chain when its first link fails, whatever was answered later', () => {
      const visible = evaluateVisibility(chain, { ...answered, [role.id]: student });
      expect([...visible]).toEqual([role.id]);
    });

    it('counts a hidden answer as empty, so "is not answered" holds for it', () => {
      const unanswered = showWhen(createField('long_text'), {
        sourceFieldId: company.id,
        operator: 'is_not_answered',
      });
      const withFallback = form(role, company, unanswered);
      const visible = evaluateVisibility(withFallback, {
        [role.id]: student,
        [company.id]: 'Acme',
      });
      expect(visible.has(unanswered.id)).toBe(true);
    });
  });

  it('shows questions whose conditions are still missing a value', () => {
    const unfinished = showWhen(createField('date'), {
      sourceFieldId: single.id,
      operator: 'equals',
    });
    expect(evaluateVisibility(form(single, unfinished), {}).has(unfinished.id)).toBe(true);
  });

  it('ignores conditions on questions that no longer exist', () => {
    const orphan = showWhen(createField('date'), {
      sourceFieldId: 'fld_gone',
      operator: 'is_answered',
    });
    expect(evaluateVisibility(form(orphan), {}).has(orphan.id)).toBe(true);
  });

  it('treats answers to later questions as empty, since conditions only look back', () => {
    const later = createField('short_text');
    const early = showWhen(createField('email'), {
      sourceFieldId: later.id,
      operator: 'is_answered',
    });
    expect(evaluateVisibility(form(early, later), { [later.id]: 'x' }).has(early.id)).toBe(false);
  });
});

describe('sanitizeAnswers', () => {
  const statement = createField('statement');
  const followUp = showWhen(createField('long_text'), {
    sourceFieldId: single.id,
    operator: 'equals',
    value: optionA,
  });
  const schema = form(single, followUp, statement, multi);

  it('keeps answers to visible questions', () => {
    const answers = { [single.id]: optionA, [followUp.id]: 'Why', [multi.id]: [multiA] };
    expect(sanitizeAnswers(schema, answers)).toEqual(answers);
  });

  it('drops answers to hidden, unknown and statement questions', () => {
    expect(
      sanitizeAnswers(schema, {
        [single.id]: optionB,
        [followUp.id]: 'Answered before the choice changed',
        [statement.id]: 'not a question',
        fld_unknown: 'x',
      }),
    ).toEqual({ [single.id]: optionB });
  });

  it('drops empty answers', () => {
    expect(sanitizeAnswers(schema, { [single.id]: null, [multi.id]: [] })).toEqual({});
  });
});
