import { RotateCw } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { NotFoundPage } from './not-found-page';

/** Top-level error boundary for anything thrown while rendering a route. */
export function RouteErrorPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <ErrorState
        className="w-full max-w-md border-none"
        title="Something went wrong"
        description="An unexpected error stopped this page from loading. Reloading usually fixes it."
        action={
          <div className="flex gap-2">
            <Button
              onClick={() => {
                window.location.reload();
              }}
            >
              <RotateCw aria-hidden />
              Reload
            </Button>
            <Button asChild variant="secondary">
              <Link to="/">Go home</Link>
            </Button>
          </div>
        }
      />
    </main>
  );
}
