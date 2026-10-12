import {
  addSubmissionToAnalytics,
  type AnalyticsRange,
  type FormAnalytics,
  type FormSummary,
  type SubmissionPage,
  type SubmissionRecord,
} from '@formyx/shared';
import type { InfiniteData } from '@tanstack/react-query';
import { produce } from 'immer';
import type { ResponseFilters } from './responses-api';

export const responseKeys = {
  /** Everything cached about a form's responses, analytics included (not the form itself). */
  all: (formId: string) => ['forms', formId, 'responses'] as const,
  lists: (formId: string) => [...responseKeys.all(formId), 'list'] as const,
  list: (formId: string, filters: ResponseFilters) =>
    [...responseKeys.lists(formId), filters] as const,
  detail: (formId: string, responseId: string) =>
    [...responseKeys.all(formId), 'detail', responseId] as const,
  analytics: (formId: string) => [...responseKeys.all(formId), 'analytics'] as const,
  analyticsFor: (formId: string, range: AnalyticsRange, timeZone: string) =>
    [...responseKeys.analytics(formId), range, timeZone] as const,
  notifications: (formId: string) => ['forms', formId, 'notifications'] as const,
};

/** Pages of a responses list, as `useInfiniteQuery` caches them. */
export type ResponsePages = InfiniteData<SubmissionPage, string | null>;

/** The filters a list query was made with, read back from its key. */
export function filtersFromKey(key: readonly unknown[]): ResponseFilters | null {
  const filters = key[4];
  if (typeof filters !== 'object' || filters === null || !('order' in filters)) return null;
  return filters as ResponseFilters;
}

function contains(data: ResponsePages, id: string): boolean {
  return data.pages.some((page) => page.submissions.some((submission) => submission.id === id));
}

/**
 * Whether a list with these filters can place a new response itself. Only the server knows
 * what a search matches, so searched lists are fetched again instead.
 */
export function canPlaceNewResponse(filters: ResponseFilters): boolean {
  return !filters.search;
}

/**
 * Adds a response that just arrived: on top of a newest-first list, or at the end of an
 * oldest-first one once its last page is loaded. A list filtered to one question's answers
 * only takes responses that answered it. Adding a response twice changes nothing.
 */
export function addResponse(
  data: ResponsePages,
  filters: ResponseFilters,
  submission: SubmissionRecord,
): ResponsePages {
  if (filters.answered && !(filters.answered in submission.answers)) return data;
  if (contains(data, submission.id)) return data;

  return produce(data, (draft) => {
    for (const page of draft.pages) page.total += 1;
    if (filters.order === 'newest') {
      draft.pages[0]?.submissions.unshift(submission);
      return;
    }
    const last = draft.pages.at(-1);
    if (last?.nextCursor === null) last.submissions.push(submission);
  });
}

/** Takes out the responses with these ids, wherever they are loaded. */
export function removeResponses(data: ResponsePages, ids: ReadonlySet<string>): ResponsePages {
  let removed = 0;
  for (const page of data.pages) {
    removed += page.submissions.filter((submission) => ids.has(submission.id)).length;
  }
  if (removed === 0) return data;

  return produce(data, (draft) => {
    for (const page of draft.pages) {
      page.submissions = page.submissions.filter((submission) => !ids.has(submission.id));
      page.total = Math.max(0, page.total - removed);
    }
  });
}

/** Puts a changed response in place of its old self, wherever it is loaded. */
export function replaceResponse(data: ResponsePages, submission: SubmissionRecord): ResponsePages {
  if (!contains(data, submission.id)) return data;
  return produce(data, (draft) => {
    for (const page of draft.pages) {
      page.submissions = page.submissions.map((current) =>
        current.id === submission.id ? submission : current,
      );
    }
  });
}

/** Counts a live response into cached analytics (totals, its day, its answers). */
export function addResponseToAnalytics(
  analytics: FormAnalytics,
  submission: SubmissionRecord,
): FormAnalytics {
  return produce(analytics, (draft) => {
    addSubmissionToAnalytics(draft, submission);
  });
}

/** Changes a form's response count by `delta`, never below zero. */
export function adjustResponseCount<T extends Pick<FormSummary, 'responseCount'>>(
  form: T,
  delta: number,
): T {
  return { ...form, responseCount: Math.max(0, form.responseCount + delta) };
}
