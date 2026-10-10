import { Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { BrandKitsCard } from '@/features/brand-kits/brand-kits-card';
import { CreateWorkspaceDialog } from '@/features/workspaces/create-workspace-dialog';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { InvitesCard } from './invites-card';
import { MembersCard } from './members-card';
import { WorkspaceDangerZone } from './workspace-danger-zone';
import { WorkspaceNameCard } from './workspace-name-card';

/** The active workspace: its name, members, invites, brand kits, and leaving or deleting it. */
export function WorkspaceSettingsPage() {
  const workspace = useActiveWorkspace();
  const [creating, setCreating] = useState(false);

  if (!workspace) {
    return (
      <>
        <EmptyState
          icon={Building2}
          title="You are not in a workspace"
          description="Create one, or ask a workspace owner to invite you."
          action={
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <Plus aria-hidden />
              Create workspace
            </Button>
          }
        />
        <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
      </>
    );
  }

  return (
    // Remounted per workspace, so nothing typed for one shows up in another.
    <div key={workspace.id} className="flex flex-col gap-6">
      <WorkspaceNameCard workspace={workspace} />
      <MembersCard workspace={workspace} />
      {workspace.role === 'OWNER' && <InvitesCard workspace={workspace} />}
      <BrandKitsCard workspace={workspace} />
      <WorkspaceDangerZone workspace={workspace} />
    </div>
  );
}
