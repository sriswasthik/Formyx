import type { FormListItem, FormStatus } from '@formyx/shared';
import type { FormFilters } from './forms-api';

/*
 * The dashboard holds every form of the workspace (the list is not paged), so it filters,
 * counts and sorts them here rather than asking the API again for each change.
 */

export const FORM_SORTS = ['edited', 'name', 'responses'] as const;
export type FormSort = (typeof FORM_SORTS)[number];

export const FORM_SORT_LABELS: Record<FormSort, string> = {
  edited: 'Last edited',
  name: 'Name',
  responses: 'Most responses',
};

/** Forms per status, and all of them: the status tabs' counts. */
export type StatusCounts = Record<FormStatus | 'ALL', number>;

export function countByStatus(forms: readonly FormListItem[]): StatusCounts {
  const counts: StatusCounts = { ALL: forms.length, DRAFT: 0, PUBLISHED: 0, CLOSED: 0 };
  for (const form of forms) counts[form.status] += 1;
  return counts;
}

/** The forms matching a search (in the title, ignoring case) and a status. */
export function filterForms(
  forms: readonly FormListItem[],
  { search, status }: FormFilters,
): FormListItem[] {
  const query = search?.trim().toLocaleLowerCase() ?? '';
  return forms.filter(
    (form) =>
      (!status || form.status === status) &&
      (!query || form.title.toLocaleLowerCase().includes(query)),
  );
}

const byName = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Ordered for `sort`; ties go to the form edited last. */
export function sortFormsBy(forms: readonly FormListItem[], sort: FormSort): FormListItem[] {
  const byEdited = (a: FormListItem, b: FormListItem) => b.updatedAt.localeCompare(a.updatedAt);
  return [...forms].sort((a, b) => {
    if (sort === 'name') return byName.compare(a.title, b.title) || byEdited(a, b);
    if (sort === 'responses') return b.responseCount - a.responseCount || byEdited(a, b);
    return byEdited(a, b);
  });
}

/** "4 forms · 128 responses this month". */
export function formsSummary(formCount: number, responsesThisMonth: number): string {
  const forms = `${String(formCount)} ${formCount === 1 ? 'form' : 'forms'}`;
  const responses = `${responsesThisMonth.toLocaleString('en-IN')} ${
    responsesThisMonth === 1 ? 'response' : 'responses'
  } this month`;
  return `${forms} · ${responses}`;
}
