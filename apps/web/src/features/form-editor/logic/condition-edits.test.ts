import { createField, type Condition } from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import {
  changeOperator,
  changeSource,
  changeValue,
  conditionSources,
  createCondition,
} from './condition-edits';

const text = createField('short_text');
const statement = createField('statement');
const choice = createField('single_choice');
const checkboxes = createField('multi_choice');
const file = createField('file');
const rating = createField('rating');
const [firstOption = ''] = choice.options.map((option) => option.id);
const [firstBox = ''] = checkboxes.options.map((option) => option.id);

describe('conditionSources', () => {
  const fields = [text, statement, choice, rating];

  it('offers earlier questions that take answers, numbered as on the canvas', () => {
    expect(conditionSources(fields, 3)).toEqual([
      { field: text, position: 1 },
      { field: choice, position: 3 },
    ]);
  });

  it('offers nothing to the first question', () => {
    expect(conditionSources(fields, 0)).toEqual([]);
  });
});

describe('createCondition', () => {
  it('starts with the first comparison the question offers', () => {
    expect(createCondition(text)).toEqual({ sourceFieldId: text.id, operator: 'equals' });
    expect(createCondition(checkboxes)).toEqual({
      sourceFieldId: checkboxes.id,
      operator: 'contains',
      value: firstBox,
    });
    expect(createCondition(file)).toEqual({ sourceFieldId: file.id, operator: 'is_answered' });
  });

  it('picks the first option of choice questions', () => {
    expect(createCondition(choice)).toEqual({
      sourceFieldId: choice.id,
      operator: 'equals',
      value: firstOption,
    });
  });
});

describe('changeSource', () => {
  it('keeps a comparison the new question offers, and drops the old value', () => {
    const condition: Condition = { sourceFieldId: text.id, operator: 'not_equals', value: 'x' };
    expect(changeSource(condition, rating)).toEqual({
      sourceFieldId: rating.id,
      operator: 'not_equals',
    });
  });

  it('falls back to the first comparison when the old one does not apply', () => {
    const condition: Condition = { sourceFieldId: text.id, operator: 'contains', value: 'x' };
    expect(changeSource(condition, choice)).toEqual({
      sourceFieldId: choice.id,
      operator: 'equals',
      value: firstOption,
    });
    expect(changeSource(condition, file)).toEqual({
      sourceFieldId: file.id,
      operator: 'is_answered',
    });
  });
});

describe('changeOperator', () => {
  const condition: Condition = { sourceFieldId: rating.id, operator: 'equals', value: 4 };

  it('keeps the value while the comparison still needs one', () => {
    expect(changeOperator(condition, 'greater_than', rating)).toEqual({
      ...condition,
      operator: 'greater_than',
    });
  });

  it('drops the value for "is answered" and "is not answered"', () => {
    expect(changeOperator(condition, 'is_answered', rating)).toEqual({
      sourceFieldId: rating.id,
      operator: 'is_answered',
    });
  });

  it('suggests the first option again when a choice comparison needs a value', () => {
    const answered: Condition = { sourceFieldId: choice.id, operator: 'is_answered' };
    expect(changeOperator(answered, 'not_equals', choice)).toEqual({
      sourceFieldId: choice.id,
      operator: 'not_equals',
      value: firstOption,
    });
  });
});

describe('changeValue', () => {
  it('sets and clears the value', () => {
    const condition: Condition = { sourceFieldId: text.id, operator: 'equals' };
    expect(changeValue(condition, 'Yes')).toEqual({ ...condition, value: 'Yes' });
    expect(changeValue({ ...condition, value: 'Yes' }, undefined)).toEqual(condition);
  });
});
