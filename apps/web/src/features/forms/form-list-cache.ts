import { copyFormTitle, formStatusSchema, type FormDetail, type FormSummary } from '@formyx/shared';
import type { QueryKey } from '@tanstack/react-query';
import type { FormFilters } from './forms-api';

export const formKeys = {
  /** Everything cached about one workspace's forms. */
  workspace: (workspaceId: string) => ['workspaces', workspaceId, 'forms'] as const,
  lists: (workspaceId: string) => [...formKeys.workspace(workspaceId), 'list'] as const,
  list: (workspaceId: string, filters: FormFilters) =>
    [...formKeys.lists(workspaceId), filters] as const,
  detail: (formId: string) => ['forms', formId] as const,
};

/** The filters a list query was made with, read back from its key. */
export function filtersFromKey(key: QueryKey): FormFilters {
  const filters = key[4];
  if (typeof filters !== 'object' || filters === null) return {};
  const search = 'search' in filters && typeof filters.search === 'string' ? filters.search : '';
  const status = formStatusSchema.safeParse('status' in filters ? filters.status : undefined);
  return { ...(search && { search }), ...(status.success && { status: status.data }) };
}

/** Mirrors the API's filtering, so optimistic inserts only land in lists that would show them. */
export function matchesFilters(form: FormSummary, { search, status }: FormFilters): boolean {
  if (status && form.status !== status) return false;
  return !search || form.title.toLowerCase().includes(search.trim().toLowerCase());
}

/** Most recently edited first, like the API. */
export function sortForms(forms: FormSummary[]): FormSummary[] {
  return [...forms].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function replaceForm(forms: FormSummary[], id: string, form: FormSummary): FormSummary[] {
  return forms.map((candidate) => (candidate.id === id ? form : candidate));
}

export function removeForm(forms: FormSummary[], id: string): FormSummary[] {
  return forms.filter((form) => form.id !== id);
}

export function insertForm(
  forms: FormSummary[],
  form: FormSummary,
  filters: FormFilters,
): FormSummary[] {
  return matchesFilters(form, filters) ? sortForms([form, ...forms]) : forms;
}

/**
 * Puts `form` in place of the form with `id`: moved to its new position, or dropped if the
 * list's filters no longer match it (e.g. after a rename).
 */
export function upsertForm(
  forms: FormSummary[],
  id: string,
  form: FormSummary,
  filters: FormFilters,
): FormSummary[] {
  return insertForm(removeForm(forms, id), form, filters);
}

const OPTIMISTIC_PREFIX = 'optimistic-';

/** Stands in for a duplicate until the server returns the real form. */
export function optimisticCopy(source: FormSummary, now = new Date()): FormSummary {
  const timestamp = now.toISOString();
  return {
    ...source,
    id: `${OPTIMISTIC_PREFIX}${Math.random().toString(36).slice(2)}`,
    title: copyFormTitle(source.title),
    slug: '',
    status: 'DRAFT',
    version: 1,
    responseCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: null,
  };
}

/** Whether the form only exists on this screen so far (a duplicate being created). */
export function isPendingForm(form: FormSummary): boolean {
  return form.id.startsWith(OPTIMISTIC_PREFIX);
}

export function toSummary({
  draftSchema: _draft,
  publishedSchema: _published,
  publishedTitle: _publishedTitle,
  theme: _theme,
  ...summary
}: FormDetail): FormSummary {
  return summary;
}
