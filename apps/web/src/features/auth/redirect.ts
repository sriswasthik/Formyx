import type { Location } from 'react-router';

export const DEFAULT_AUTHENTICATED_PATH = '/app';

/** Router state carried to /login and /signup so users land where they were going. */
export interface AuthRedirectState {
  from: string;
  /** Fills in the email field, e.g. with the address an invite was sent to. */
  email?: string;
}

export function redirectStateFor(location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  return {
    from: `${location.pathname}${location.search}${location.hash}`,
  } satisfies AuthRedirectState;
}

/**
 * Where to go after signing in. Only paths inside the app (and invite links) are accepted,
 * so a crafted state can never send anyone to another site or back to a public page.
 */
export function getRedirectTarget(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  const { from } = state;
  if (typeof from !== 'string') return DEFAULT_AUTHENTICATED_PATH;

  const isAppPath = from === '/app' || /^\/app[/?#]/.test(from);
  const isInvitePath = /^\/invite\/[\w-]+$/.test(from);
  return isAppPath || isInvitePath ? from : DEFAULT_AUTHENTICATED_PATH;
}

/** The email to start the log-in or sign-up form with, if the state carries one. */
export function getRedirectEmail(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('email' in state)) return '';
  return typeof state.email === 'string' ? state.email : '';
}
