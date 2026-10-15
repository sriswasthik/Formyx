import { usePrefetchQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { RouteFallback } from '@/app/root-layout';
import { signInProvidersQuery } from './auth-api';
import { getRedirectTarget } from './redirect';
import { useMe } from './use-session';

/** The longest the log-in and sign-up pages wait on the session check before showing. */
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
  const waitedLongEnough = useElapsed(GUEST_WAIT_MS);
  // Alongside the session check, so the "Continue with Google" buttons are ready with the form.
  usePrefetchQuery(signInProvidersQuery);

  // Hold the form back while we find out, so signed-in users don't see it flash, but not for
  // long: if the check fails or is slow, show the page (a late answer still sends them on).
  // The form reports connection problems itself.
  if (me === undefined && !error && failureCount === 0 && !waitedLongEnough) {
    return <RouteFallback />;
  }

  if (me) return <Navigate to={getRedirectTarget(location.state)} replace />;

  return <Outlet />;
}
