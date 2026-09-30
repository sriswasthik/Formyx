import type { Location } from 'react-router';

export const DEFAULT_AUTHENTICATED_PATH = '/app';

/** Router state carried to /login and /signup so users land where they were going. */
export interface AuthRedirectState {
  from: string;
}

export function redirectStateFor(location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  return {
    from: `${location.pathname}${location.search}${location.hash}`,
  } satisfies AuthRedirectState;
}

/**
 * Where to go after signing in. Only paths inside the app are accepted, so a crafted
 * state can never send anyone to another site or back to a public page.
 */
export function getRedirectTarget(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  const { from } = state;
  if (typeof from !== 'string') return DEFAULT_AUTHENTICATED_PATH;

  const isAppPath = from === '/app' || /^\/app[/?#]/.test(from);
  return isAppPath ? from : DEFAULT_AUTHENTICATED_PATH;
}
