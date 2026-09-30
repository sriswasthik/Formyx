import { ROLE_LABELS } from '@formyx/shared';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession } from '@/features/auth/session-context';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';

function WorkspaceAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary text-12 font-semibold text-primary-foreground"
    >
      {Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?'}
    </span>
  );
}

export function WorkspaceSwitcher() {
  const { workspaces } = useSession();
  const active = useActiveWorkspace();
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId);
  const activeName = active?.name ?? 'No workspace';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Switch workspace, current workspace: ${activeName}`}
          className="flex h-9 w-full items-center gap-2 rounded-lg border bg-background px-2 text-left text-14 font-medium transition-colors duration-150 ease-standard hover:border-border-strong active:bg-pressed data-[state=open]:border-border-strong"
        >
          <WorkspaceAvatar name={activeName} />
          <span className="flex-1 truncate">{activeName}</span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
      >
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={active?.id ?? ''} onValueChange={setActiveWorkspaceId}>
          {workspaces.map((workspace) => (
            <DropdownMenuRadioItem key={workspace.id} value={workspace.id}>
              <WorkspaceAvatar name={workspace.name} />
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
              <span className="text-12 text-muted-foreground">{ROLE_LABELS[workspace.role]}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <Plus aria-hidden />
          Create workspace
          <Badge variant="outline" className="ml-auto">
            Soon
          </Badge>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
