import { createDefaultTheme, type FormListItem } from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import { countByStatus, filterForms, formsSummary, sortFormsBy } from './forms-view';

function form(overrides: Partial<FormListItem>): FormListItem {
  return {
    id: overrides.title ?? 'f',
    workspaceId: 'w1',
    title: 'Form',
    slug: 'form-abc',
    status: 'DRAFT',
    version: 1,
    responseCount: 0,
    responsesToday: 0,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    publishedAt: null,
    theme: createDefaultTheme(),
    ...overrides,
  };
}

const forms = [
  form({
    title: 'Party RSVP',
    status: 'PUBLISHED',
    responseCount: 40,
    updatedAt: '2026-10-03T00:00:00.000Z',
  }),
  form({
    title: 'apple feedback',
    status: 'DRAFT',
    responseCount: 0,
    updatedAt: '2026-10-05T00:00:00.000Z',
  }),
  form({
    title: 'Course 10',
    status: 'CLOSED',
    responseCount: 40,
    updatedAt: '2026-10-04T00:00:00.000Z',
  }),
  form({
    title: 'Course 9',
    status: 'PUBLISHED',
    responseCount: 7,
    updatedAt: '2026-10-02T00:00:00.000Z',
  }),
];

describe('countByStatus', () => {
  it('counts every form and each status', () => {
    expect(countByStatus(forms)).toEqual({ ALL: 4, PUBLISHED: 2, DRAFT: 1, CLOSED: 1 });
    expect(countByStatus([])).toEqual({ ALL: 0, PUBLISHED: 0, DRAFT: 0, CLOSED: 0 });
  });
});

describe('filterForms', () => {
  it('finds titles ignoring case, within a status', () => {
    expect(filterForms(forms, { search: 'COURSE' }).map((f) => f.title)).toEqual([
      'Course 10',
      'Course 9',
    ]);
    expect(
      filterForms(forms, { search: 'course', status: 'PUBLISHED' }).map((f) => f.title),
    ).toEqual(['Course 9']);
    expect(filterForms(forms, {})).toHaveLength(4);
  });
});

describe('sortFormsBy', () => {
  it('sorts by last edit, by name as people read it, and by responses', () => {
    expect(sortFormsBy(forms, 'edited').map((f) => f.title)).toEqual([
      'apple feedback',
      'Course 10',
      'Party RSVP',
      'Course 9',
    ]);
    // Case-insensitive, with numbers in order: 9 before 10.
    expect(sortFormsBy(forms, 'name').map((f) => f.title)).toEqual([
      'apple feedback',
      'Course 9',
      'Course 10',
      'Party RSVP',
    ]);
    // A tie on responses goes to the one edited last.
    expect(sortFormsBy(forms, 'responses').map((f) => f.title)).toEqual([
      'Course 10',
      'Party RSVP',
      'Course 9',
      'apple feedback',
    ]);
  });
});

describe('formsSummary', () => {
  it('says how many forms and responses this month', () => {
    expect(formsSummary(4, 128)).toBe('4 forms · 128 responses this month');
    expect(formsSummary(1, 1)).toBe('1 form · 1 response this month');
    expect(formsSummary(12, 12_500)).toBe('12 forms · 12,500 responses this month');
  });
});
