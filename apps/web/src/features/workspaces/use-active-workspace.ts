import type { WorkspaceSummary } from '@formyx/shared';
import { useSession } from '@/features/auth/session-context';
import { resolveActiveWorkspace, useWorkspaceStore } from './workspace-store';

/** The workspace the user is working in. `null` only if they belong to none. */
export function useActiveWorkspace(): WorkspaceSummary | null {
  const { workspaces } = useSession();
  const storedId = useWorkspaceStore((state) => state.activeWorkspaceId);
  return resolveActiveWorkspace(workspaces, storedId);
}
