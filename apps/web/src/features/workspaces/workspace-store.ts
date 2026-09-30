import type { WorkspaceSummary } from '@formyx/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const ACTIVE_WORKSPACE_STORAGE_KEY = 'formyx-active-workspace';

interface WorkspaceState {
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      setActiveWorkspaceId: (activeWorkspaceId) => {
        set({ activeWorkspaceId });
      },
    }),
    {
      name: ACTIVE_WORKSPACE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ activeWorkspaceId }) => ({ activeWorkspaceId }),
    },
  ),
);

/**
 * The stored workspace if the user still belongs to it, otherwise their first one. A stale id
 * (left by another account, or a workspace the user was removed from) is simply ignored.
 */
export function resolveActiveWorkspace(
  workspaces: readonly WorkspaceSummary[],
  storedId: string | null,
): WorkspaceSummary | null {
  return workspaces.find((workspace) => workspace.id === storedId) ?? workspaces[0] ?? null;
}
