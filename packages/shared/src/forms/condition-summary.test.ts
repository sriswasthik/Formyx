import { describe, expect, it } from 'vitest';
import { describeConditions } from './condition-summary.js';
import { createField } from './factories.js';
import type { Field } from './fields.js';

const role = { ...createField('single_choice'), label: 'Role' };
const [student = ''] = role.options.map((option) => option.id);
const satisfaction = { ...createField('rating'), label: 'Overall satisfaction' };
const start = { ...createField('date'), label: 'Start date' };
const fields: Field[] = [role, satisfaction, start];

function withConditions(field: Partial<Field>): Field {
  return { ...createField('long_text'), ...field } as Field;
}

describe('describeConditions', () => {
  it('describes one condition in words, with option labels rather than ids', () => {
    const field = withConditions({
      conditions: [{ sourceFieldId: role.id, operator: 'equals', value: student }],
    });
    expect(describeConditions(field, fields)).toBe('Shown when "Role" is "Option 1"');
  });

  it('joins conditions with "and" or "or" to match the form', () => {
    const conditions = [
      { sourceFieldId: satisfaction.id, operator: 'less_than' as const, value: 3 },
      { sourceFieldId: start.id, operator: 'greater_than' as const, value: '2026-01-01' },
    ];
    expect(describeConditions(withConditions({ conditions }), fields)).toBe(
      'Shown when "Overall satisfaction" is less than 3 and "Start date" is greater than 2026-01-01',
    );
    expect(describeConditions(withConditions({ conditions, conditionMatch: 'any' }), fields)).toBe(
      'Shown when "Overall satisfaction" is less than 3 or "Start date" is greater than 2026-01-01',
    );
  });

  it('needs no value for "is answered"', () => {
    const field = withConditions({
      conditions: [{ sourceFieldId: role.id, operator: 'is_not_answered' }],
    });
    expect(describeConditions(field, fields)).toBe('Shown when "Role" is not answered');
  });

  it('shortens long question labels', () => {
    const long = {
      ...createField('short_text'),
      label: 'What is the name of the company you work for right now?',
    };
    const field = withConditions({
      conditions: [{ sourceFieldId: long.id, operator: 'contains', value: 'Acme' }],
    });
    expect(describeConditions(field, [long])).toBe(
      'Shown when "What is the name of the company you work…" contains "Acme"',
    );
  });

  it('leaves out incomplete conditions, and says nothing when none are complete', () => {
    const field = withConditions({
      conditions: [
        { sourceFieldId: role.id, operator: 'equals' },
        { sourceFieldId: 'fld_gone', operator: 'is_answered' },
      ],
    });
    expect(describeConditions(field, fields)).toBeNull();
    expect(describeConditions(createField('email'), fields)).toBeNull();
  });
});
