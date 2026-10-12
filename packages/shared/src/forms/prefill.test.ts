import { describe, expect, it } from 'vitest';
import { createField } from './factories.js';
import { linkAnswers, prefilledLink, prefillValue } from './prefill.js';

const size = {
  ...createField('single_choice'),
  id: 'size',
  label: 'Size',
  options: [
    { id: 'opt_s', label: 'Small' },
    { id: 'opt_l', label: 'Large' },
  ],
};
const toppings = {
  ...createField('multi_choice'),
  id: 'toppings',
  label: 'Toppings',
  options: [
    { id: 'opt_cheese', label: 'Cheese' },
    { id: 'opt_olive', label: 'Olives' },
  ],
};
const rating = { ...createField('rating'), id: 'stars', ratingScale: 5 };
const fields = [
  { ...createField('short_text'), id: 'name', label: 'Name' },
  { ...createField('email'), id: 'email', label: 'Email' },
  size,
  toppings,
  rating,
  { ...createField('yes_no'), id: 'ok', label: 'OK?' },
  { ...createField('date'), id: 'when', label: 'When' },
  { ...createField('number'), id: 'count', label: 'Count', validation: { max: 10 } },
  { ...createField('hidden'), id: 'src', label: 'Source', paramName: 'source' },
  { ...createField('file'), id: 'cv', label: 'CV' },
];

describe('prefillValue', () => {
  it('reads options by label or id, in any case', () => {
    expect(prefillValue(size, 'large')).toBe('opt_l');
    expect(prefillValue(size, 'opt_s')).toBe('opt_s');
    expect(prefillValue(size, 'Huge')).toBeUndefined();
    expect(prefillValue(toppings, 'Cheese, olives')).toEqual(['opt_cheese', 'opt_olive']);
    expect(prefillValue(toppings, 'Cheese, Ham')).toBeUndefined();
  });

  it('reads numbers, yes or no, and dates, and ignores what would not be valid', () => {
    expect(prefillValue(rating, '4')).toBe(4);
    expect(prefillValue(rating, '9')).toBeUndefined();
    const [, email, , , , ok, when, count] = fields;
    if (!email || !ok || !when || !count) throw new Error('missing fields');
    expect(prefillValue(ok, 'YES')).toBe('yes');
    expect(prefillValue(when, '2026-10-12')).toBe('2026-10-12');
    expect(prefillValue(when, '12/10/2026')).toBeUndefined();
    expect(prefillValue(count, '1,000')).toBeUndefined();
    expect(prefillValue(count, '7')).toBe(7);
    expect(prefillValue(email, 'not an email')).toBeUndefined();
  });
});

describe('linkAnswers', () => {
  it('fills questions by id and hidden fields by their parameter, skipping the rest', () => {
    const params = new URLSearchParams(
      'name=Ada&size=Large&stars=12&source=newsletter&cv=x.pdf&unknown=1',
    );
    expect(linkAnswers({ fields }, params)).toEqual({
      name: 'Ada',
      size: 'opt_l',
      src: 'newsletter',
    });
  });
});

describe('prefilledLink', () => {
  it('adds each value as a parameter, leaving empty ones out', () => {
    expect(
      prefilledLink('https://formyx.app/f/pizza?embed=1', { name: 'Ada Lovelace', size: '' }),
    ).toBe('https://formyx.app/f/pizza?embed=1&name=Ada+Lovelace');
  });
});
