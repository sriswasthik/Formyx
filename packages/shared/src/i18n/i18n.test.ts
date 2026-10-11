import { describe, expect, it } from 'vitest';
import { createEmptyForm, createField } from '../forms/factories.js';
import type { FormSchema } from '../forms/form-schema.js';
import { buildSubmissionValidator, validateAnswers } from '../forms/submission.js';
import { pipedAnswer, resolvePiping } from '../logic/piping.js';
import { FORM_MESSAGES } from './catalogs.js';
import { en } from './en.js';
import { DEFAULT_FORMAT, formatDate, formatDateTime, formatMoney, formatNumber } from './format.js';
import { hi } from './hi.js';
import { FORM_LANGUAGES } from './languages.js';
import { formLocale } from './locale.js';
import type { FormMessages } from './messages.js';
import { te } from './te.js';

/** Every leaf of a catalog: strings, and what each function says for sample arguments. */
function leaves(messages: FormMessages): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') out[path] = value;
    else if (typeof value === 'function')
      out[path] = String((value as (...args: unknown[]) => unknown)(3, 7));
    else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        walk(item, `${path}.${index}`);
      });
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, path ? `${path}.${key}` : key);
    }
  };
  walk(messages, '');
  return out;
}

describe('catalogs', () => {
  it('has one for every language', () => {
    expect(Object.keys(FORM_MESSAGES).sort()).toEqual([...FORM_LANGUAGES].sort());
  });

  it.each([
    ['te', te],
    ['hi', hi],
  ])('says everything in %s, and none of it is left in English', (_language, catalog) => {
    const english = leaves(en);
    const translated = leaves(catalog);
    expect(Object.keys(translated)).toEqual(Object.keys(english));
    for (const [path, text] of Object.entries(translated)) {
      expect(text.trim(), path).not.toBe('');
      // Product and key names stay as they are; anything else must differ from English.
      if (!/Formyx|Enter|example\.com/.test(text)) expect(text, path).not.toBe(english[path]);
    }
  });

  it('passes the numbers it is given through', () => {
    expect(te.nav.pageOf(2, 5)).toContain('2');
    expect(te.nav.pageOf(2, 5)).toContain('5');
    expect(hi.check.atMostCharacters(40)).toContain('40');
  });
});

describe('formats', () => {
  it('writes numbers the Indian, international and European ways', () => {
    expect(formatNumber(123456.5, { ...DEFAULT_FORMAT, numberFormat: 'indian' })).toBe(
      '1,23,456.5',
    );
    expect(formatNumber(123456.5, { ...DEFAULT_FORMAT, numberFormat: 'international' })).toBe(
      '123,456.5',
    );
    expect(formatNumber(123456.5, { ...DEFAULT_FORMAT, numberFormat: 'european' })).toBe(
      '123.456,5',
    );
    // As forms always wrote them.
    expect(formatNumber(123456.5)).toBe('123,456.5');
    expect(formatMoney(150000, 'INR')).toBe('₹1,50,000');
    expect(formatMoney(1499.5, 'USD')).toBe('$1,499.50');
  });

  it('writes calendar dates in the chosen order, on the same day everywhere', () => {
    const format = (dateFormat: typeof DEFAULT_FORMAT.dateFormat) =>
      formatDate('2026-10-05', { ...DEFAULT_FORMAT, dateFormat });
    expect(format('dmy')).toBe('05/10/2026');
    expect(format('mdy')).toBe('10/05/2026');
    expect(format('ymd')).toBe('2026-10-05');
    expect(format('auto')).toBe('5 Oct 2026');
    expect(formatDate('not a date')).toBe('not a date');
  });

  it('writes a moment in a time zone', () => {
    expect(
      formatDateTime('2026-10-12T18:30:00Z', 'Asia/Kolkata', {
        ...DEFAULT_FORMAT,
        dateFormat: 'dmy',
      }),
    ).toMatch(/^13\/10\/2026, 12:00\sam$/i);
  });
});

function teluguForm(): FormSchema {
  const form = createEmptyForm();
  return {
    ...form,
    settings: { ...form.settings, language: 'te', numberFormat: 'indian' },
    fields: [
      { ...createField('short_text'), id: 'name', label: 'పేరు', required: true },
      {
        ...createField('number'),
        id: 'count',
        label: 'Count',
        validation: { max: 100000 },
      },
      { ...createField('yes_no'), id: 'ok', label: 'OK?' },
      { ...createField('date'), id: 'when', label: 'When' },
    ],
  };
}

describe('checks in the form language', () => {
  it('words problems from the catalog, with numbers in the form format', () => {
    const form = teluguForm();
    const errors = validateAnswers(form, { count: 200000 }, te);
    expect(errors).toEqual({
      name: te.check.required,
      count: te.check.numberAtMost('1,00,000'),
    });
  });

  it('keeps English as it was', () => {
    const form = { ...teluguForm(), settings: createEmptyForm().settings };
    expect(validateAnswers(form, { count: 200000 })).toEqual({
      name: 'This question is required',
      count: 'Enter a number of at most 100000',
    });
    expect(buildSubmissionValidator(form, {}).safeParse({}).success).toBe(false);
  });
});

describe('piping in the form language', () => {
  it('pipes yes, no and dates in its words and formats', () => {
    const form = teluguForm();
    const locale = formLocale({ ...form.settings, dateFormat: 'dmy' }, te);
    const fieldById = new Map(form.fields.map((field) => [field.id, field]));
    const yesNo = form.fields[2];
    if (!yesNo) throw new Error('missing field');
    expect(pipedAnswer(yesNo, 'yes', locale)).toBe('అవును');
    expect(
      resolvePiping('{{field:when}} / {{field:count}}', {
        fieldById,
        answers: { when: '2026-10-05', count: 150000 },
        values: {},
        variables: [],
        locale,
      }),
    ).toBe('05/10/2026 / 1,50,000');
  });
});
