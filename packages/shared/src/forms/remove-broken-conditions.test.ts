import { describe, expect, it } from 'vitest';
import { createEmptyForm, createField } from './factories.js';
import type { Field } from './fields.js';
import { formSchema, removeBrokenConditions, type FormSchema } from './form-schema.js';

function formWith(...fields: Field[]): FormSchema {
  return { ...createEmptyForm(), fields };
}

const choice = createField('single_choice');
const yes = choice.options[0]?.id ?? '';
const rating = createField('rating');
const followUp: Field = {
  ...createField('long_text'),
  conditions: [{ sourceFieldId: choice.id, operator: 'equals', value: yes }],
};
const lowRating: Field = {
  ...createField('email'),
  conditionMatch: 'any',
  conditions: [
    { sourceFieldId: rating.id, operator: 'less_than', value: 3 },
    { sourceFieldId: choice.id, operator: 'is_answered' },
  ],
};

describe('removeBrokenConditions', () => {
  it('returns the same form when every condition holds', () => {
    const form = formWith(choice, rating, followUp, lowRating);
    const result = removeBrokenConditions(form);

    expect(result.removed).toBe(0);
    expect(result.form).toBe(form);
  });

  it('drops conditions whose question moved below them', () => {
    const result = removeBrokenConditions(formWith(followUp, choice));

    expect(result.removed).toBe(1);
    expect(result.form.fields[0]).not.toHaveProperty('conditions');
  });

  it('drops conditions on deleted questions and options, keeping the rest', () => {
    const withoutRating = removeBrokenConditions(formWith(choice, followUp, lowRating));
    expect(withoutRating.removed).toBe(1);
    expect(withoutRating.form.fields[2]).toMatchObject({
      conditionMatch: 'any',
      conditions: [{ sourceFieldId: choice.id, operator: 'is_answered' }],
    });

    const optionGone = { ...choice, options: choice.options.slice(1) };
    const withoutOption = removeBrokenConditions(formWith(optionGone, followUp));
    expect(withoutOption.removed).toBe(1);
  });

  it('removes the match mode along with the last condition', () => {
    const result = removeBrokenConditions(formWith(lowRating));

    expect(result.removed).toBe(2);
    expect(result.form.fields[0]).not.toHaveProperty('conditions');
    expect(result.form.fields[0]).not.toHaveProperty('conditionMatch');
  });

  it('drops values a changed question can no longer have', () => {
    const smallerScale = { ...rating, ratingScale: 3 };
    const needsFive: Field = {
      ...createField('short_text'),
      conditions: [{ sourceFieldId: rating.id, operator: 'equals', value: 5 }],
    };

    expect(removeBrokenConditions(formWith(smallerScale, needsFive)).removed).toBe(1);
  });

  it('always leaves a valid form', () => {
    const messy = formWith(lowRating, followUp, choice);
    const { form } = removeBrokenConditions(messy);

    expect(formSchema.safeParse(messy).success).toBe(false);
    expect(formSchema.safeParse(form).success).toBe(true);
  });
});
