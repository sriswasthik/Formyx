import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { meQueryKey, replaceSession } from '@/features/auth/session-cache';
import { ApiRequestError } from '@/lib/api';

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

export function createQueryClient() {
  /** Any 401 means the session expired or was revoked; `ProtectedRoute` then sends the user to /login. */
  const endSession = (error: unknown) => {
    // Nobody was signed in (e.g. a failed log-in attempt): nothing to end.
    if (!isUnauthorized(error) || !queryClient.getQueryData(meQueryKey)) return;
    replaceSession(queryClient, null);
    toast.info('Your session has ended', { description: 'Log in again to continue.' });
  };

  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: endSession }),
    mutationCache: new MutationCache({ onError: endSession }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Client errors (4xx) will not fix themselves; only retry server/network failures.
        retry: (failureCount, error) => {
          if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });

  return queryClient;
}
