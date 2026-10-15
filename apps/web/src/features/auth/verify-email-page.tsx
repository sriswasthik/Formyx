import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useNoIndex } from '@/app/page-title';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api';
import { verifyEmail } from './auth-api';
import { meQueryKey } from './session-cache';

/** Where the link in the "Confirm your email" message lands. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  // Read once: the token leaves the address bar so it isn't kept in history or shared.
  const [token] = useState(() => params.get('token') ?? '');
  const queryClient = useQueryClient();
  useNoIndex(true);
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const result = useQuery({
    queryKey: ['auth', 'verify-email', token],
    queryFn: async () => {
      await verifyEmail(token);
      // Anyone signed in here sees the banner go.
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      return true;
    },
    enabled: token !== '',
    retry: false,
    staleTime: Infinity,
  });

  const expired =
    token === '' ||
    (result.error instanceof ApiRequestError && result.error.code === 'BAD_REQUEST');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-16 text-center">
      {result.isSuccess ? (
        <>
          <CircleCheck className="size-8 text-success" aria-hidden />
          <h1 className="mt-4 text-24 font-semibold tracking-tight">Your email is confirmed</h1>
          <p className="mt-2 max-w-sm text-14 text-muted-foreground">You can publish forms now.</p>
          <Button asChild className="mt-6">
            <Link to="/app">Go to Formyx</Link>
          </Button>
        </>
      ) : expired || result.isError ? (
        <>
          <CircleAlert className="size-8 text-warning" aria-hidden />
          <h1 className="mt-4 text-24 font-semibold tracking-tight">
            {expired ? 'This link no longer works' : 'We couldn’t confirm your email'}
          </h1>
          <p className="mt-2 max-w-sm text-14 text-muted-foreground">
            {expired
              ? 'It may have expired. Send yourself a new one from the banner at the top of Formyx.'
              : 'Check your connection and open the link again.'}
          </p>
          <Button asChild variant="secondary" className="mt-6">
            <Link to="/app">Go to Formyx</Link>
          </Button>
        </>
      ) : (
        <div
          role="status"
          className="flex flex-col items-center gap-3 text-14 text-muted-foreground"
        >
          <LoaderCircle className="size-6 motion-safe:animate-spin" aria-hidden />
          Confirming your email…
        </div>
      )}
    </main>
  );
}
