import type { MeResponse } from '@formyx/shared';
import type { QueryClient } from '@tanstack/react-query';

export const meQueryKey = ['auth', 'me'] as const;

/**
 * Whether this browser signed in and has not signed out since. The session cookie is
 * httpOnly, so scripts cannot see it; without this hint every signed-out visitor would ask
 * the API about a session that does not exist, and browsers log the 401 as a console error.
 */
export const SESSION_HINT_STORAGE_KEY = 'formyx-signed-in';

export function hasSessionHint(): boolean {
  try {
    return window.localStorage.getItem(SESSION_HINT_STORAGE_KEY) === '1';
  } catch {
    // Storage unavailable (privacy mode): fall back to asking the API.
    return true;
  }
}

export function setSessionHint(signedIn: boolean): void {
  try {
    if (signedIn) window.localStorage.setItem(SESSION_HINT_STORAGE_KEY, '1');
    else window.localStorage.removeItem(SESSION_HINT_STORAGE_KEY);
  } catch {
    // Not persisting the hint only costs an extra request on the next visit.
  }
}

/**
 * Stores who is signed in (`null` for nobody) and drops every other cached query,
 * so nothing loaded for one account is ever shown to the next.
 */
export function replaceSession(queryClient: QueryClient, me: MeResponse | null): void {
  setSessionHint(me !== null);
  queryClient.setQueryData<MeResponse | null>(meQueryKey, me);
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meQueryKey[0] });
}
