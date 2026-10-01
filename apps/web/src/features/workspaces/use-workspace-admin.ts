import type {
  CreateInviteInput,
  Invite,
  Member,
  MeResponse,
  Role,
  WorkspaceSummary,
} from '@formyx/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { meQueryKey } from '@/features/auth/session-cache';
import { ApiRequestError } from '@/lib/api';
import {
  acceptInvite,
  changeMemberRole,
  createWorkspace,
  deleteWorkspace,
  listInvites,
  listMembers,
  removeMember,
  renameWorkspace,
  resendInvite,
  revokeInvite,
  sendInvite,
} from './workspaces-api';
import { useWorkspaceStore } from './workspace-store';

export const workspaceKeys = {
  all: (workspaceId: string) => ['workspaces', workspaceId] as const,
  members: (workspaceId: string) => ['workspaces', workspaceId, 'members'] as const,
  invites: (workspaceId: string) => ['workspaces', workspaceId, 'invites'] as const,
};

/** What to tell people when a change was refused, in the server's words where it has some. */
export function changeErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'NETWORK_ERROR') return 'Check your connection and try again.';
    if (error.status >= 400 && error.status < 500) return error.message;
  }
  return 'Something went wrong. Please try again.';
}

/** Applies `change` to the signed-in user's list of workspaces. */
function updateSessionWorkspaces(
  queryClient: QueryClient,
  change: (workspaces: WorkspaceSummary[]) => WorkspaceSummary[],
) {
  queryClient.setQueryData<MeResponse | null>(meQueryKey, (me) =>
    me ? { ...me, workspaces: change(me.workspaces) } : me,
  );
}

/** Forgets a workspace the user no longer belongs to, and everything loaded for it. */
function dropWorkspace(queryClient: QueryClient, workspaceId: string) {
  updateSessionWorkspaces(queryClient, (workspaces) =>
    workspaces.filter((workspace) => workspace.id !== workspaceId),
  );
  const store = useWorkspaceStore.getState();
  if (store.activeWorkspaceId === workspaceId) store.setActiveWorkspaceId(null);
  queryClient.removeQueries({ queryKey: workspaceKeys.all(workspaceId) });
  queryClient.removeQueries({ queryKey: ['forms'] });
}

export function useMembers(workspaceId: string) {
  return useQuery({
    queryKey: workspaceKeys.members(workspaceId),
    queryFn: () => listMembers(workspaceId),
  });
}

export function useInvites(workspaceId: string, { enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: workspaceKeys.invites(workspaceId),
    queryFn: () => listInvites(workspaceId),
    enabled,
  });
}

/** Creates a workspace and switches to it. */
export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkspace,
    onSuccess: (workspace) => {
      updateSessionWorkspaces(queryClient, (workspaces) => [...workspaces, workspace]);
      useWorkspaceStore.getState().setActiveWorkspaceId(workspace.id);
    },
  });
}

export function useRenameWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameWorkspace(workspaceId, name),
    onSuccess: (renamed) => {
      updateSessionWorkspaces(queryClient, (workspaces) =>
        workspaces.map((workspace) => (workspace.id === renamed.id ? renamed : workspace)),
      );
    },
  });
}

export function useDeleteWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteWorkspace(workspaceId),
    onSuccess: () => {
      dropWorkspace(queryClient, workspaceId);
    },
  });
}

/** Removes someone else, or with `self`, leaves the workspace. */
export function useRemoveMember(workspaceId: string, selfId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeMember(workspaceId, userId),
    onSuccess: (_result, userId) => {
      if (userId === selfId) {
        dropWorkspace(queryClient, workspaceId);
        return;
      }
      queryClient.setQueryData<Member[]>(workspaceKeys.members(workspaceId), (members) =>
        members?.filter((member) => member.userId !== userId),
      );
    },
  });
}

export function useChangeRole(workspaceId: string, selfId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      changeMemberRole(workspaceId, userId, role),
    onSuccess: (changed) => {
      queryClient.setQueryData<Member[]>(workspaceKeys.members(workspaceId), (members) =>
        members?.map((member) => (member.userId === changed.userId ? changed : member)),
      );
      // Owners who step down see the workspace with their new access right away.
      if (changed.userId === selfId) {
        updateSessionWorkspaces(queryClient, (workspaces) =>
          workspaces.map((workspace) =>
            workspace.id === workspaceId ? { ...workspace, role: changed.role } : workspace,
          ),
        );
      }
    },
  });
}

function upsertInvite(queryClient: QueryClient, workspaceId: string, invite: Invite) {
  queryClient.setQueryData<Invite[]>(workspaceKeys.invites(workspaceId), (invites = []) => [
    invite,
    ...invites.filter((existing) => existing.id !== invite.id),
  ]);
}

export function useSendInvite(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInviteInput) => sendInvite(workspaceId, input),
    onSuccess: ({ invite }) => {
      upsertInvite(queryClient, workspaceId, invite);
    },
  });
}

export function useResendInvite(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => resendInvite(workspaceId, inviteId),
    onSuccess: ({ invite }) => {
      upsertInvite(queryClient, workspaceId, invite);
    },
  });
}

export function useRevokeInvite(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => revokeInvite(workspaceId, inviteId),
    onSuccess: (_result, inviteId) => {
      queryClient.setQueryData<Invite[]>(workspaceKeys.invites(workspaceId), (invites) =>
        invites?.filter((invite) => invite.id !== inviteId),
      );
    },
  });
}

/** Joins the workspace an invite is for, and switches to it. */
export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptInvite,
    onSuccess: (joined) => {
      updateSessionWorkspaces(queryClient, (workspaces) => [
        ...workspaces.filter((workspace) => workspace.id !== joined.id),
        joined,
      ]);
      useWorkspaceStore.getState().setActiveWorkspaceId(joined.id);
    },
  });
}
