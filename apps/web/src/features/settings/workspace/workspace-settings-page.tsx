import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { NoWorkspace } from './no-workspace';
import { WorkspaceDangerZone } from './workspace-danger-zone';
import { WorkspaceNameCard } from './workspace-name-card';
import { WorkspacePreferencesCard } from './workspace-preferences-card';

/**
 * The active workspace: its name, preferences, and leaving or deleting it. Its members and
 * brand kits have pages of their own.
 */
export function WorkspaceSettingsPage() {
  const workspace = useActiveWorkspace();
  if (!workspace) return <NoWorkspace />;
  return (
    // Remounted per workspace, so nothing typed for one shows up in another.
    <div key={workspace.id} className="flex flex-col gap-6">
      <WorkspaceNameCard workspace={workspace} />
      <WorkspacePreferencesCard workspace={workspace} />
      <WorkspaceDangerZone workspace={workspace} />
    </div>
  );
}
