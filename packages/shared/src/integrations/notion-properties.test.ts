import { describe, expect, it } from 'vitest';
import { createEmptyForm, createField, createOption } from '../forms/factories.js';
import type { FormSchema } from '../forms/form-schema.js';
import type { SubmissionRecord } from '../forms/responses.js';
import { notionIdProperty, planNotionProperties } from './notion-properties.js';

const red = createOption('Red, bright');
const blue = createOption('Blue');
const name = { ...createField('short_text'), id: 'fld_name', label: 'Name' };
const email = { ...createField('email'), id: 'fld_email', label: 'Email' };
const colour = {
  ...createField('single_choice'),
  id: 'fld_colour',
  label: 'Colour',
  options: [red, blue],
};
const tags = {
  ...createField('multi_choice'),
  id: 'fld_tags',
  label: 'Tags',
  options: [red, blue],
};
const guests = { ...createField('number'), id: 'fld_guests', label: 'Guests' };

const schema = (...fields: FormSchema['fields']): FormSchema => ({ ...createEmptyForm(), fields });
const sources = { collectsEmail: false, allowsEdits: false };
const response: SubmissionRecord = {
  id: 'sub_1',
  createdAt: '2026-10-12T09:30:00.000Z',
  completionTimeMs: 30_000,
  answers: {
    fld_name: 'Ada',
    fld_email: 'ada@example.com',
    fld_colour: red.id,
    fld_tags: [red.id, blue.id],
    fld_guests: 2,
  },
  metadata: { userAgent: null, referrer: null },
  outcome: null,
};

describe('planNotionProperties', () => {
  it('types each question as Notion would: emails, selects, multi-selects, numbers', () => {
    const plan = planNotionProperties(null, schema(name, email, colour, tags, guests), sources);
    expect(plan.properties.map(({ name: property, type }) => [property, type])).toEqual([
      ['Response', 'title'],
      ['Response ID', 'rich_text'],
      ['Submitted at (UTC)', 'date'],
      ['Name', 'rich_text'],
      ['Email', 'email'],
      ['Colour', 'select'],
      ['Tags', 'multi_select'],
      ['Guests', 'number'],
      ['Time to complete (seconds)', 'number'],
    ]);
    expect(plan.added).toEqual(plan.properties);
    expect(notionIdProperty(plan.properties)).toBe('Response ID');
  });

  it('writes values in the shapes Notion takes, option names without commas', () => {
    const plan = planNotionProperties(null, schema(name, email, colour, tags, guests), sources);
    const values = plan.values(response);
    expect(values.Response).toEqual({
      title: [{ type: 'text', text: { content: 'Response · 2026-10-12 09:30 UTC' } }],
    });
    expect(values['Submitted at (UTC)']).toEqual({ date: { start: '2026-10-12T09:30:00.000Z' } });
    expect(values.Email).toEqual({ email: 'ada@example.com' });
    expect(values.Colour).toEqual({ select: { name: 'Red  bright' } });
    expect(values.Tags).toEqual({ multi_select: [{ name: 'Red  bright' }, { name: 'Blue' }] });
    expect(values.Guests).toEqual({ number: 2 });
  });

  it('adds new questions and renames changed ones, never reusing a name', () => {
    const first = planNotionProperties(null, schema(name, guests), sources);
    const next = planNotionProperties(
      first.properties,
      schema({ ...name, label: 'Full name' }, guests, { ...colour, label: 'Guests' }),
      sources,
    );
    expect(next.renamed).toEqual([{ from: 'Name', to: 'Full name' }]);
    expect(next.added.map((property) => property.name)).toEqual(['Guests (2)']);
    expect(new Set(next.properties.map((property) => property.name)).size).toBe(
      next.properties.length,
    );
  });
});
