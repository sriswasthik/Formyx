import { Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { CreateWorkspaceDialog } from '@/features/workspaces/create-workspace-dialog';

/** For workspace pages, when the person is in no workspace at all. */
export function NoWorkspace() {
  const [creating, setCreating] = useState(false);
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
