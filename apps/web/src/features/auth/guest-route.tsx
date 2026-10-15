import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { RouteFallback } from '@/app/root-layout';
import { signInProvidersQuery } from './auth-api';
import { getRedirectTarget } from './redirect';
import { useMe } from './use-session';

/** The longest the log-in and sign-up pages wait on the session and provider checks. */
export const GUEST_WAIT_MS = 3000;

function useElapsed(ms: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setElapsed(true);
    }, ms);
    return () => {
      window.clearTimeout(timer);
    };
  }, [ms]);
  return elapsed;
}

/**
 * For pages only signed-out users need (log in, sign up). Signed-in users continue to where
 * they were going, which is also what happens right after a successful log-in or sign-up.
 */
export function GuestRoute() {
  const location = useLocation();
  const { data: me, error, failureCount } = useMe();
  // Alongside the session check, so the "Continue with Google" buttons arrive with the form
  // instead of pushing it down a moment later.
  const providers = useQuery(signInProvidersQuery);
  const waitedLongEnough = useElapsed(GUEST_WAIT_MS);

  // Hold the page back while we find out, so signed-in users don't see the form flash, but not
  // for long: if either check fails or is slow, show it (a late answer still sends them on).
  // The form reports connection problems itself.
  const sessionUnknown = me === undefined && !error && failureCount === 0;
  const providersUnknown = providers.isPending && providers.failureCount === 0;
  if ((sessionUnknown || providersUnknown) && !waitedLongEnough) {
    return <RouteFallback />;
  }

  if (me) return <Navigate to={getRedirectTarget(location.state)} replace />;

  return <Outlet />;
}
