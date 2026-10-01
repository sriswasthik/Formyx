import { isRouteErrorResponse, useRouteError } from 'react-router';
import { CrashScreen } from './crash-screen';
import { NotFoundPage } from './not-found-page';

/** Top-level error boundary for anything thrown while rendering or loading a route. */
export function RouteErrorPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  return <CrashScreen error={error} />;
}
