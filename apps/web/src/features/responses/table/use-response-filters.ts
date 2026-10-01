import { NODE_ID_PATTERN, submissionOrderSchema, type SubmissionOrder } from '@formyx/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { ResponseFilters } from '../responses-api';

export const SEARCH_DEBOUNCE_MS = 300;

/**
 * The table's filters and the open response, kept in the URL (`?q=…&answered=…&response=…`)
 * so links from emails and summaries land on the right view, and reloads keep it. The search
 * box updates at once; the URL (and so the request) follows once typing pauses.
 */
export function useResponseFilters() {
  const [params, setParams] = useSearchParams();
  const search = params.get('q')?.trim() ?? '';
  const answeredParam = params.get('answered');
  const answered = answeredParam && NODE_ID_PATTERN.test(answeredParam) ? answeredParam : undefined;
  const parsedOrder = submissionOrderSchema.safeParse(params.get('order'));
  const order: SubmissionOrder = parsedOrder.success ? parsedOrder.data : 'newest';
  const openResponseId = params.get('response');

  const [searchInput, setSearchInput] = useState(search);
  // Follow URL changes made elsewhere (back button, "Clear"), keeping spaces still being typed.
  const [previousSearch, setPreviousSearch] = useState(search);
  if (search !== previousSearch) {
    setPreviousSearch(search);
    if (searchInput.trim() !== search) setSearchInput(search);
  }

  const updateParams = useCallback(
    (changes: Record<string, string | undefined>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    const typed = searchInput.trim();
    if (typed === search) return;
    const id = window.setTimeout(() => {
      updateParams({ q: typed });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [searchInput, search, updateParams]);

  const filters = useMemo<ResponseFilters>(
    () => ({ order, ...(search && { search }), ...(answered && { answered }) }),
    [order, search, answered],
  );

  return {
    filters,
    searchInput,
    setSearchInput,
    setOrder: (next: SubmissionOrder) => {
      updateParams({ order: next === 'newest' ? undefined : next });
    },
    clearAnswered: () => {
      updateParams({ answered: undefined });
    },
    clearAll: () => {
      setSearchInput('');
      updateParams({ q: undefined, answered: undefined });
    },
    openResponseId,
    openResponse: (id: string | null) => {
      updateParams({ response: id ?? undefined });
    },
  };
}
