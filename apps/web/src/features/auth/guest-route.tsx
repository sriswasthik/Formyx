import { usePrefetchQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router';
import { RouteFallback } from '@/app/root-layout';
import { signInProvidersQuery } from './auth-api';
import { getRedirectTarget } from './redirect';
import { useMe } from './use-session';

/**
 * For pages only signed-out users need (log in, sign up). Signed-in users continue to where
 * they were going, which is also what happens right after a successful log-in or sign-up.
 */
export function GuestRoute() {
  const location = useLocation();
  const { data: me, error } = useMe();
  // Alongside the session check, so the "Continue with Google" buttons are ready with the form.
  usePrefetchQuery(signInProvidersQuery);

  // Hold the form back until we know, so signed-in users never see it flash. If the session
  // check itself failed, show the page anyway: the form reports connection problems itself.
  if (me === undefined && !error) return <RouteFallback />;

  if (me) return <Navigate to={getRedirectTarget(location.state)} replace />;

  return <Outlet />;
}
