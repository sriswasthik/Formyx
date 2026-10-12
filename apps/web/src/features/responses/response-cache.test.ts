import type { SubmissionPage, SubmissionRecord } from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import {
  addResponse,
  canPlaceNewResponse,
  filtersFromKey,
  removeResponses,
  responseKeys,
  type ResponsePages,
} from './response-cache';

function record(id: string, answers: SubmissionRecord['answers'] = {}): SubmissionRecord {
  return {
    id,
    createdAt: '2026-10-01T09:00:00.000Z',
    completionTimeMs: null,
    answers,
    metadata: { userAgent: null, referrer: null },
    outcome: null,
  };
}

function pages(...ids: string[][]): ResponsePages {
  const total = ids.flat().length;
  const built: SubmissionPage[] = ids.map((page, index) => ({
    submissions: page.map((id) => record(id)),
    nextCursor: index < ids.length - 1 ? `cursor_${index}` : null,
    total,
  }));
  return {
    pages: built,
    pageParams: built.map((_, index) => (index === 0 ? null : `cursor_${index - 1}`)),
  };
}

const idsOf = (data: ResponsePages) =>
  data.pages.map((page) => page.submissions.map(({ id }) => id));
const totalsOf = (data: ResponsePages) => data.pages.map((page) => page.total);

describe('addResponse', () => {
  it('puts a new response on top of a newest-first list and counts it', () => {
    const next = addResponse(pages(['b', 'a']), { order: 'newest' }, record('c'));
    expect(idsOf(next)).toEqual([['c', 'b', 'a']]);
    expect(totalsOf(next)).toEqual([3]);
  });

  it('adds a response only once', () => {
    const data = pages(['b', 'a']);
    expect(addResponse(data, { order: 'newest' }, record('a'))).toBe(data);
  });

  it('appends to an oldest-first list only once its last page is loaded', () => {
    const loaded = pages(['a', 'b']);
    const moreToCome: ResponsePages = {
      ...loaded,
      pages: loaded.pages.map((page) => ({ ...page, nextCursor: 'more' })),
    };

    expect(idsOf(addResponse(loaded, { order: 'oldest' }, record('c')))).toEqual([['a', 'b', 'c']]);
    // Not paged to the end yet: the response is counted, and shows up once paged to.
    const partial = addResponse(moreToCome, { order: 'oldest' }, record('c'));
    expect(idsOf(partial)).toEqual([['a', 'b']]);
    expect(totalsOf(partial)).toEqual([3]);
  });

  it('leaves a list of one question’s answers alone when the response skipped it', () => {
    const data = pages(['a']);
    const filters = { order: 'newest' as const, answered: 'fld_comment' };

    expect(addResponse(data, filters, record('b'))).toBe(data);
    expect(idsOf(addResponse(data, filters, record('c', { fld_comment: 'Hi' })))).toEqual([
      ['c', 'a'],
    ]);
  });
});

describe('canPlaceNewResponse', () => {
  it('leaves searched lists to the server', () => {
    expect(canPlaceNewResponse({ order: 'newest' })).toBe(true);
    expect(canPlaceNewResponse({ order: 'newest', search: 'ada' })).toBe(false);
  });
});

describe('removeResponses', () => {
  it('takes responses out of every page and lowers the totals', () => {
    const next = removeResponses(pages(['d', 'c'], ['b', 'a']), new Set(['c', 'a', 'unknown']));
    expect(idsOf(next)).toEqual([['d'], ['b']]);
    expect(totalsOf(next)).toEqual([2, 2]);
  });

  it('changes nothing when none of the ids are loaded', () => {
    const data = pages(['a']);
    expect(removeResponses(data, new Set(['z']))).toBe(data);
  });
});

describe('filtersFromKey', () => {
  it('reads the filters back from a list key', () => {
    const filters = { order: 'oldest' as const, search: 'x' };
    expect(filtersFromKey(responseKeys.list('form_1', filters))).toEqual(filters);
    expect(filtersFromKey(responseKeys.analytics('form_1'))).toBeNull();
  });
});
