import { describe, expect, it } from 'vitest';
import { createEmptyForm, createField, createOption } from '../forms/factories.js';
import type { Field } from '../forms/fields.js';
import type { FormSchema } from '../forms/form-schema.js';
import { buildRedirectUrl, displayOrder, presentField } from './presentation.js';
import type { PipingContext } from './piping.js';

const name = { ...createField('short_text'), id: 'name', label: 'Name' };
const a = { ...createField('short_text'), id: 'a' };
const b = { ...createField('short_text'), id: 'b' };
const c = { ...createField('short_text'), id: 'c' };
const d = { ...createField('short_text'), id: 'd' };
const page2 = { ...createField('page_break'), id: 'p2' };
const other = createOption('Other');
const colour = {
  ...createField('single_choice'),
  id: 'colour',
  label: 'Favourite colour, {{field:name}}?',
  description: 'Pick one',
  options: [createOption('Red'), createOption('Green'), createOption('Blue'), other],
  shuffleOptions: true,
  keepLastOption: true,
};

function form(fields: Field[], shuffle: string[] = []): FormSchema {
  const base = createEmptyForm();
  return {
    ...base,
    fields,
    logic: {
      ...base.logic,
      pages: Object.fromEntries(shuffle.map((key) => [key, { shuffleQuestions: true }])),
    },
  };
}

const piping = (answers: PipingContext['answers']): PipingContext => ({
  fieldById: new Map([name, colour].map((field) => [field.id, field])),
  answers,
  values: {},
  variables: [],
});

describe('displayOrder', () => {
  it('keeps the form order unless a page shuffles its questions', () => {
    const schema = form([a, b, c, page2, d]);
    expect(displayOrder(schema, 'seed').map((field) => field.id)).toEqual([
      'a',
      'b',
      'c',
      'p2',
      'd',
    ]);
  });

  it('shuffles within a page only, the same way for the same respondent', () => {
    const schema = form([a, b, c, page2, d], ['start']);
    const order = displayOrder(schema, 'respondent-1').map((field) => field.id);
    expect(order.slice(3)).toEqual(['p2', 'd']);
    expect([...order.slice(0, 3)].sort()).toEqual(['a', 'b', 'c']);
    expect(displayOrder(schema, 'respondent-1').map((field) => field.id)).toEqual(order);
    const orders = new Set(
      ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((seed) =>
        displayOrder(schema, seed)
          .map((field) => field.id)
          .join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe('presentField', () => {
  it('pipes answers into the label and shuffles options, keeping the last', () => {
    const presented = presentField(colour, { piping: piping({ name: 'Ada' }), seed: 's' });
    expect(presented.label).toBe('Favourite colour, Ada?');
    expect(presented.description).toBe('Pick one');
    expect(presented.options.at(-1)).toBe(other);
    expect(presented.options).toHaveLength(4);
  });

  it('returns the field itself when there is nothing to change', () => {
    expect(presentField(name, { piping: piping({}), seed: 's' })).toBe(name);
  });

  it('escapes answers piped into a statement, which is rich text', () => {
    const statement = { ...createField('statement'), label: 'Hello {{field:name}}' };
    expect(presentField(statement, { piping: piping({ name: '**Ada**' }), seed: 's' }).label).toBe(
      'Hello \\*\\*Ada\\*\\*',
    );
  });
});

describe('buildRedirectUrl', () => {
  const context = {
    fieldById: new Map<string, Field>([name, colour].map((field) => [field.id, field])),
    answers: { name: 'Ada Lovelace', colour: other.id },
    values: { total: 1500.5, score: 12345 },
    variables: [
      { id: 'total', name: 'Total', kind: 'price' as const, initial: 0, currency: 'INR' },
      { id: 'score', name: 'Score', kind: 'score' as const, initial: 0 },
    ],
  };

  it('adds the chosen answers and values, keeping the parameters already there', () => {
    const url = buildRedirectUrl(
      {
        url: 'https://shop.example/thanks?ref=formyx',
        params: [
          { name: 'name', source: { kind: 'answer', fieldId: 'name' } },
          { name: 'colour', source: { kind: 'answer', fieldId: 'colour' } },
          { name: 'total', source: { kind: 'variable', variableId: 'total' } },
          { name: 'score', source: { kind: 'variable', variableId: 'score' } },
          { name: '', source: { kind: 'answer', fieldId: 'name' } },
        ],
      },
      context,
    );
    expect(url).toBe(
      'https://shop.example/thanks?ref=formyx&name=Ada+Lovelace&colour=Other&total=1500.5&score=12345',
    );
  });

  it('only goes to https addresses', () => {
    expect(buildRedirectUrl({ url: 'http://example.com', params: [] }, context)).toBeNull();
    expect(buildRedirectUrl({ url: 'javascript:alert(1)', params: [] }, context)).toBeNull();
    expect(buildRedirectUrl({ url: 'not a url', params: [] }, context)).toBeNull();
  });
});
