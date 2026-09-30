import { formStatusSchema, type FormStatus } from '@formyx/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { FormFilters } from './forms-api';

export const SEARCH_DEBOUNCE_MS = 250;

function parseStatus(value: string | null): FormStatus | undefined {
  const result = formStatusSchema.safeParse(value?.toUpperCase());
  return result.success ? result.data : undefined;
}

/**
 * Search and status filters, kept in the URL (`?q=…&status=published`) so they survive
 * reloads and the back button. The search box updates instantly; the URL (and so the
 * request) follows once typing pauses.
 */
export function useFormsFilters() {
  const [params, setParams] = useSearchParams();
  const search = params.get('q')?.trim() ?? '';
  const status = parseStatus(params.get('status'));

  const [searchInput, setSearchInput] = useState(search);

  // Follow URL changes made elsewhere (back button, "Clear filters"), without clobbering
  // trailing spaces the user is still typing.
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

  const filters = useMemo<FormFilters>(
    () => ({ ...(search && { search }), ...(status && { status }) }),
    [search, status],
  );

  return {
    filters,
    searchInput,
    setSearchInput,
    setStatus: (next: FormStatus | undefined) => {
      updateParams({ status: next?.toLowerCase() });
    },
    hasFilters: Boolean(search || status),
    clearFilters: () => {
      setSearchInput('');
      updateParams({ q: undefined, status: undefined });
    },
  };
}
