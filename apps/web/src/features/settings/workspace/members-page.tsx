import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { InvitesCard } from './invites-card';
import { MembersCard } from './members-card';
import { NoWorkspace } from './no-workspace';

/** Who is in the active workspace, their roles, and (for owners) the invites out. */
export function MembersPage() {
  const workspace = useActiveWorkspace();
  if (!workspace) return <NoWorkspace />;
  return (
    // Remounted per workspace, so nothing typed for one shows up in another.
    <div key={workspace.id} className="flex flex-col gap-6">
      <MembersCard workspace={workspace} />
      {workspace.role === 'OWNER' && <InvitesCard workspace={workspace} />}
    </div>
  );
}
