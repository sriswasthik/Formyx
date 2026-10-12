import { describe, expect, it } from 'vitest';
import { createField, createOption } from '../forms/factories.js';
import type { Field } from '../forms/fields.js';
import { createRule, createVariable } from '../forms/logic-factories.js';
import type { Rule, Variable } from '../forms/logic-schema.js';
import { computeVariables } from './calculations.js';

const small = createOption('Small');
const large = createOption('Large');
const size = {
  ...createField('single_choice'),
  id: 'size',
  options: [small, large],
};
const quantity = { ...createField('number'), id: 'qty' };
const fieldById = new Map<string, Field>([size, quantity].map((field) => [field.id, field]));

const price: Variable = { ...createVariable('price'), id: 'price', initial: 100 };
const sizeIs = (id: string) =>
  [{ kind: 'answer', sourceFieldId: size.id, operator: 'equals', value: id }] as Rule['when'];
const rule = (props: Partial<Rule>): Rule => ({ ...createRule(price.id), ...props });

describe('computeVariables', () => {
  it('starts each variable at its initial value', () => {
    expect(computeVariables({ variables: [price], rules: [] }, fieldById, {})).toEqual({
      price: 100,
    });
  });

  it('runs the rules whose conditions hold, in order, each seeing the last', () => {
    const rules = [
      rule({ when: sizeIs(large.id), operation: 'add', amount: { kind: 'number', value: 50 } }),
      rule({
        when: sizeIs(small.id),
        operation: 'subtract',
        amount: { kind: 'number', value: 20 },
      }),
      // Always: then times the quantity.
      rule({ operation: 'multiply', amount: { kind: 'answer', fieldId: quantity.id } }),
    ];
    const logic = { variables: [price], rules };
    expect(computeVariables(logic, fieldById, { size: large.id, qty: 3 })).toEqual({ price: 450 });
    expect(computeVariables(logic, fieldById, { size: small.id, qty: 2 })).toEqual({ price: 160 });
  });

  it('skips a rule whose amount is an unanswered question', () => {
    const logic = {
      variables: [price],
      rules: [rule({ operation: 'multiply', amount: { kind: 'answer', fieldId: quantity.id } })],
    };
    expect(computeVariables(logic, fieldById, {})).toEqual({ price: 100 });
  });

  it('sets a value outright, and checks values in conditions', () => {
    const logic = {
      variables: [price],
      rules: [
        rule({ operation: 'set', amount: { kind: 'number', value: 5 } }),
        rule({
          when: [{ kind: 'variable', variableId: price.id, operator: 'equals', value: 5 }],
          operation: 'add',
          amount: { kind: 'number', value: 1 },
        }),
      ],
    };
    expect(computeVariables(logic, fieldById, {})).toEqual({ price: 6 });
  });

  it('keeps decimals tidy and ignores rules for unknown variables', () => {
    const logic = {
      variables: [{ ...price, initial: 0.1 }],
      rules: [
        rule({ amount: { kind: 'number', value: 0.2 } }),
        { ...rule({}), variableId: 'gone' },
      ],
    };
    expect(computeVariables(logic, fieldById, {})).toEqual({ price: 0.3 });
  });
});
