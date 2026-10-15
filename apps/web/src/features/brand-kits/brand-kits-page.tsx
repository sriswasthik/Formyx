import { NoWorkspace } from '@/features/settings/workspace/no-workspace';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { BrandKitsCard } from './brand-kits-card';

/** The active workspace's brand kits, and which one new forms start from. */
export function BrandKitsPage() {
  const workspace = useActiveWorkspace();
  if (!workspace) return <NoWorkspace />;
  return <BrandKitsCard key={workspace.id} workspace={workspace} />;
}
