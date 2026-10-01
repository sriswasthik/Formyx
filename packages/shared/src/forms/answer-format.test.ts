import { describe, expect, it } from 'vitest';
import { answerableFields, formatAnswer, REMOVED_OPTION_LABEL } from './answer-format.js';
import { createEmptyForm, createField } from './factories.js';
import type { Field } from './fields.js';

const options = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];
const single: Field = { ...createField('single_choice'), options };
const dropdown: Field = { ...createField('dropdown'), options };
const multi: Field = { ...createField('multi_choice'), options };

describe('formatAnswer', () => {
  it('shows option labels for choices', () => {
    expect(formatAnswer(single, 'yes')).toBe('Yes');
    expect(formatAnswer(dropdown, 'no')).toBe('No');
    expect(formatAnswer(multi, ['no', 'yes'])).toBe('No, Yes');
  });

  it('marks options removed since the response', () => {
    expect(formatAnswer(single, 'maybe')).toBe(REMOVED_OPTION_LABEL);
    expect(formatAnswer(multi, ['yes', 'maybe'])).toBe(`Yes, ${REMOVED_OPTION_LABEL}`);
  });

  it('shows text, numbers, ratings and dates as stored', () => {
    expect(formatAnswer(createField('short_text'), 'Ada')).toBe('Ada');
    expect(formatAnswer(createField('number'), -12.5)).toBe('-12.5');
    expect(formatAnswer(createField('rating'), 4)).toBe('4');
    expect(formatAnswer(createField('date'), '2026-09-30')).toBe('2026-09-30');
  });

  it('shows uploaded files by name, and old file answers as stored', () => {
    const file = {
      url: 'https://res.cloudinary.com/demo/raw/upload/v1/formyx/cv.pdf',
      publicId: 'formyx/cv',
      name: 'cv.pdf',
      size: 1200,
      type: 'application/pdf',
    };
    expect(formatAnswer(createField('file'), file)).toBe('cv.pdf');
    expect(formatAnswer(createField('file'), 'old-cv.pdf')).toBe('old-cv.pdf');
  });

  it('is empty without an answer', () => {
    expect(formatAnswer(createField('short_text'), undefined)).toBe('');
    expect(formatAnswer(single, null)).toBe('');
  });

  it('still shows a value that no longer fits its question', () => {
    expect(formatAnswer(createField('number'), 'twelve')).toBe('twelve');
    expect(formatAnswer(single, ['yes'])).toBe('yes');
    expect(formatAnswer(createField('short_text'), { nested: true })).toBe('');
  });
});

describe('answerableFields', () => {
  it('leaves out statements', () => {
    const text = createField('short_text');
    const fields = answerableFields({
      ...createEmptyForm(),
      fields: [createField('statement'), text],
    });
    expect(fields).toEqual([text]);
  });
});
