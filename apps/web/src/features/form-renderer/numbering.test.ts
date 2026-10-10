import { createField } from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import { questionNumbers } from './numbering';

const fields = [
  { ...createField('short_text'), id: 'a' },
  { ...createField('statement'), id: 'note' },
  { ...createField('email'), id: 'b' },
  { ...createField('rating'), id: 'c' },
];

describe('questionNumbers', () => {
  it('numbers nothing when the theme does not', () => {
    expect(questionNumbers(fields, 'none').size).toBe(0);
  });

  it('counts questions in order, skipping statements', () => {
    expect(Object.fromEntries(questionNumbers(fields, 'number'))).toEqual({
      a: '1',
      b: '2',
      c: '3',
    });
    expect(Object.fromEntries(questionNumbers(fields, 'letter'))).toEqual({
      a: 'A',
      b: 'B',
      c: 'C',
    });
  });

  it('goes on past Z as spreadsheet columns do', () => {
    const many = Array.from({ length: 28 }, (_, index) => ({
      ...createField('short_text'),
      id: `q${index}`,
    }));
    const numbers = questionNumbers(many, 'letter');
    expect(numbers.get('q25')).toBe('Z');
    expect(numbers.get('q26')).toBe('AA');
    expect(numbers.get('q27')).toBe('AB');
  });
});
