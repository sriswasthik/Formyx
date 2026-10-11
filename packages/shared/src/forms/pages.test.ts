import { describe, expect, it } from 'vitest';
import { createField } from './factories.js';
import type { Field } from './fields.js';
import { hiddenFieldValues, splitIntoPages } from './pages.js';
import { HIDDEN_VALUE_MAX_LENGTH } from './submission.js';

const node = (id: string, type: Field['type']) => ({ id, type });

describe('hiddenFieldValues', () => {
  const source = { ...createField('hidden'), id: 'source', paramName: 'source' };
  const campaign = { ...createField('hidden'), id: 'campaign', paramName: 'utm_campaign' };
  const unnamed = { ...createField('hidden'), id: 'unnamed', paramName: '' };
  const question = createField('short_text');
  const schema = { fields: [source, campaign, unnamed, question] };

  it('fills hidden fields from the matching link parameters', () => {
    const params = new URLSearchParams('source=instagram&utm_campaign=diwali&other=1');
    expect(hiddenFieldValues(schema, params)).toEqual({ source: 'instagram', campaign: 'diwali' });
  });

  it('leaves out missing and empty values and never fills other questions', () => {
    const params = new URLSearchParams(`source=%20%20&${question.id}=x`);
    expect(hiddenFieldValues(schema, params)).toEqual({});
  });

  it('matches names exactly and trims and caps values', () => {
    const long = 'a'.repeat(HIDDEN_VALUE_MAX_LENGTH + 20);
    const params = new URLSearchParams({ Source: 'x', utm_campaign: ` ${long} ` });
    expect(hiddenFieldValues(schema, params)).toEqual({
      campaign: 'a'.repeat(HIDDEN_VALUE_MAX_LENGTH),
    });
  });
});

describe('splitIntoPages', () => {
  it('keeps a form without page breaks on one page', () => {
    const fields = [node('a', 'short_text'), node('b', 'email')];
    expect(splitIntoPages(fields)).toEqual([{ start: null, fields }]);
  });

  it('starts a page at each page break', () => {
    const one = node('one', 'page_break');
    const pages = splitIntoPages([node('a', 'short_text'), one, node('b', 'email')]);
    expect(pages.map((page) => [page.start?.id ?? null, page.fields.map((f) => f.id)])).toEqual([
      [null, ['a']],
      ['one', ['b']],
    ]);
  });

  it('leaves out empty pages and keeps hidden fields on the first shown page', () => {
    const pages = splitIntoPages([
      node('h', 'hidden'),
      node('p1', 'page_break'),
      node('p2', 'page_break'),
      node('a', 'short_text'),
      node('p3', 'page_break'),
      node('h2', 'hidden'),
    ]);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.start?.id).toBe('p2');
    expect(pages[0]?.fields.map((field) => field.id)).toEqual(['a', 'h', 'h2']);
  });

  it('gives one page even when nothing is shown', () => {
    expect(splitIntoPages([node('p', 'page_break'), node('h', 'hidden')])).toEqual([
      { start: null, fields: [node('h', 'hidden')] },
    ]);
  });
});
