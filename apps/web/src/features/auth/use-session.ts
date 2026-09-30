import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';
import { fetchMe, logIn, logOut, signUp } from './auth-api';
import { meQueryKey, replaceSession } from './session-cache';

/** `undefined` while loading, `null` when signed out, otherwise the user and their workspaces. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
  });
}

export function useLogIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logIn,
    onSuccess: (me) => {
      replaceSession(queryClient, me);
    },
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signUp,
    onSuccess: (me) => {
      replaceSession(queryClient, me);
    },
  });
}

/** Signing out sends the user to /login: `ProtectedRoute` reacts to the cleared session. */
export function useLogOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logOut,
    onSuccess: () => {
      useWorkspaceStore.getState().setActiveWorkspaceId(null);
      replaceSession(queryClient, null);
    },
  });
}
