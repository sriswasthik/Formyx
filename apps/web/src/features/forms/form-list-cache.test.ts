import type { FormSummary } from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import {
  filtersFromKey,
  formKeys,
  insertForm,
  isPendingForm,
  matchesFilters,
  optimisticCopy,
  removeForm,
  replaceForm,
  sortForms,
  upsertForm,
} from './form-list-cache';

function summary(overrides: Partial<FormSummary>): FormSummary {
  return {
    id: 'f1',
    workspaceId: 'w1',
    title: 'Customer feedback',
    slug: 'customer-feedback-abc',
    status: 'DRAFT',
    version: 3,
    responseCount: 12,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-29T10:00:00.000Z',
    publishedAt: null,
    ...overrides,
  };
}

const older = summary({ id: 'old', updatedAt: '2026-09-01T00:00:00.000Z' });
const newer = summary({ id: 'new', updatedAt: '2026-09-20T00:00:00.000Z' });

describe('filtersFromKey', () => {
  it('reads back the filters of a list key', () => {
    expect(filtersFromKey(formKeys.list('w1', { search: 'nps', status: 'PUBLISHED' }))).toEqual({
      search: 'nps',
      status: 'PUBLISHED',
    });
    expect(filtersFromKey(formKeys.list('w1', {}))).toEqual({});
    expect(filtersFromKey(['something', 'else'])).toEqual({});
  });
});

describe('matchesFilters', () => {
  it('matches titles case-insensitively and by status', () => {
    expect(matchesFilters(summary({}), {})).toBe(true);
    expect(matchesFilters(summary({}), { search: 'FEED' })).toBe(true);
    expect(matchesFilters(summary({}), { search: 'survey' })).toBe(false);
    expect(matchesFilters(summary({}), { status: 'DRAFT' })).toBe(true);
    expect(matchesFilters(summary({}), { status: 'PUBLISHED' })).toBe(false);
  });
});

describe('list updates', () => {
  it('sorts by last edit, newest first, without mutating', () => {
    const list = [older, newer];
    expect(sortForms(list).map((form) => form.id)).toEqual(['new', 'old']);
    expect(list.map((form) => form.id)).toEqual(['old', 'new']);
  });

  it('replaces and removes by id', () => {
    const renamed = { ...older, title: 'Renamed' };
    expect(replaceForm([newer, older], 'old', renamed)).toEqual([newer, renamed]);
    expect(removeForm([newer, older], 'new')).toEqual([older]);
  });

  it('inserts only into lists whose filters match, in order', () => {
    const fresh = summary({ id: 'fresh', updatedAt: '2026-09-30T00:00:00.000Z' });

    expect(insertForm([newer, older], fresh, {}).map((form) => form.id)).toEqual([
      'fresh',
      'new',
      'old',
    ]);
    expect(insertForm([newer], fresh, { status: 'PUBLISHED' })).toEqual([newer]);
  });

  it('moves an updated form to its new place, or out of lists it no longer matches', () => {
    const renamed = { ...older, title: 'Event signup', updatedAt: '2026-09-30T00:00:00.000Z' };

    expect(upsertForm([newer, older], 'old', renamed, {}).map((form) => form.id)).toEqual([
      'old',
      'new',
    ]);
    expect(upsertForm([newer, older], 'old', renamed, { search: 'feedback' })).toEqual([newer]);
  });
});

describe('optimisticCopy', () => {
  it('looks like the duplicate the server will create', () => {
    const source = summary({ status: 'PUBLISHED', publishedAt: '2026-09-02T00:00:00.000Z' });
    const now = new Date('2026-09-30T12:00:00.000Z');

    const copy = optimisticCopy(source, now);

    expect(copy).toMatchObject({
      title: 'Customer feedback (copy)',
      status: 'DRAFT',
      version: 1,
      responseCount: 0,
      publishedAt: null,
      updatedAt: now.toISOString(),
    });
    expect(isPendingForm(copy)).toBe(true);
    expect(isPendingForm(source)).toBe(false);
  });
});
