import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useNoIndex } from '@/app/page-title';
import { Button } from '@/components/ui/button';
import { meQueryKey } from '@/features/auth/session-cache';
import { ApiRequestError } from '@/lib/api';
import { restoreAccountByLink } from './privacy-api';

/** Where "Keep my account" in the deletion email lands: no sign-in needed. */
export function RestoreAccountPage() {
  const [params] = useSearchParams();
  // Read once: the token leaves the address bar so it isn't kept in history or shared.
  const [token] = useState(() => params.get('token') ?? '');
  const queryClient = useQueryClient();
  useNoIndex(true);
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const result = useQuery({
    queryKey: ['account', 'restore', token],
    queryFn: async () => {
      await restoreAccountByLink(token);
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      return true;
    },
    enabled: token !== '',
    retry: false,
    staleTime: Infinity,
  });

  const expired =
    token === '' ||
    (result.error instanceof ApiRequestError &&
      (result.error.code === 'NOT_FOUND' || result.error.code === 'VALIDATION_ERROR'));

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-16 text-center">
      {result.isSuccess ? (
        <>
          <CircleCheck className="size-8 text-success" aria-hidden />
          <h1 className="mt-4 text-24 font-semibold tracking-tight">Your account is staying</h1>
          <p className="mt-2 max-w-sm text-14 text-muted-foreground">
            Nothing will be deleted. Sign in to carry on where you left off.
          </p>
          <Button asChild className="mt-6">
            <Link to="/login">Sign in</Link>
          </Button>
        </>
      ) : expired || result.isError ? (
        <>
          <CircleAlert className="size-8 text-warning" aria-hidden />
          <h1 className="mt-4 text-24 font-semibold tracking-tight">
            {expired ? 'This link no longer works' : 'We couldn’t keep your account'}
          </h1>
          <p className="mt-2 max-w-sm text-14 text-muted-foreground">
            {expired
              ? 'The account was kept already, or it has been deleted. Sign in to check.'
              : 'Check your connection and open the link again, or sign in to keep it.'}
          </p>
          <Button asChild variant="secondary" className="mt-6">
            <Link to="/login">Sign in</Link>
          </Button>
        </>
      ) : (
        <div
          role="status"
          className="flex flex-col items-center gap-3 text-14 text-muted-foreground"
        >
          <LoaderCircle className="size-6 motion-safe:animate-spin" aria-hidden />
          Keeping your account…
        </div>
      )}
    </main>
  );
}
