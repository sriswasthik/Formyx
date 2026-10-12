import { RotateCw } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { ErrorState } from '@/components/error-state';
import { useAccountPreferencesSync } from '@/features/account/use-account-preferences';
import { Button } from '@/components/ui/button';
import { redirectStateFor } from './redirect';
import { SessionContext } from './session-context';
import { SessionSkeleton } from './session-skeleton';
import { useMe } from './use-session';

/** Applies and saves the account's look and motion while signed in. */
function AccountPreferencesSync() {
  useAccountPreferencesSync();
  return null;
}

/** Renders its child routes only for signed-in users; everyone else is sent to /login. */
export function ProtectedRoute() {
  const location = useLocation();
  const { data: me, error, isRefetching, refetch } = useMe();

  if (me === undefined) {
    if (!error) return <SessionSkeleton />;
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <ErrorState
          className="w-full max-w-md border-none"
          title="Could not load your account"
          description="Check your connection and try again."
          action={
            <Button
              disabled={isRefetching}
              onClick={() => {
                void refetch();
              }}
            >
              <RotateCw aria-hidden />
              Try again
            </Button>
          }
        />
      </main>
    );
  }

  if (me === null) {
    return <Navigate to="/login" replace state={redirectStateFor(location)} />;
  }

  return (
    <SessionContext.Provider value={me}>
      <AccountPreferencesSync />
      <Outlet />
    </SessionContext.Provider>
  );
}
