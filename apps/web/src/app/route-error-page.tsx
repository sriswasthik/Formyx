import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { reportError } from '@/lib/report-error';
import { CrashScreen } from './crash-screen';
import { NotFoundPage } from './not-found-page';

/** Top-level error boundary for anything thrown while rendering or loading a route. */
export function RouteErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (!notFound) reportError(error, { boundary: 'route' });
  }, [error, notFound]);

  if (notFound) {
    return <NotFoundPage />;
  }

  return <CrashScreen error={error} />;
}
