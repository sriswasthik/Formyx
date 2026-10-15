import { ROLE_LABELS } from '@formyx/shared';
import { ChevronsUpDown, Plus, Settings } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ActionTooltip } from '@/components/action-tooltip';
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
import { useWorkspaceEntitlements } from '@/features/entitlements/use-entitlements';
import { CreateWorkspaceDialog } from '@/features/workspaces/create-workspace-dialog';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';
import { cn } from '@/lib/utils';
import { workspacePlanLabel } from './plan-label';

function WorkspaceAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground',
        size === 'md' ? 'size-7 text-13' : 'size-5 text-12',
      )}
    >
      {Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?'}
    </span>
  );
}

interface WorkspaceSwitcherProps {
  collapsed?: boolean;
  onNavigate?: (() => void) | undefined;
}

/** The workspace being worked in, its plan, and the way to another or a new one. */
export function WorkspaceSwitcher({ collapsed = false, onNavigate }: WorkspaceSwitcherProps) {
  const { workspaces } = useSession();
  const [creating, setCreating] = useState(false);
  const active = useActiveWorkspace();
  const { entitlements } = useWorkspaceEntitlements(active?.id);
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId);
  const activeName = active?.name ?? 'No workspace';
  const plan = active ? workspacePlanLabel(entitlements, active.role) : 'Create one to start';

  const trigger = collapsed ? (
    <button
      type="button"
      aria-label={`Switch workspace, current workspace: ${activeName}`}
      className="flex size-8 items-center justify-center rounded-md transition-colors duration-150 ease-standard hover:bg-hover active:bg-pressed data-[state=open]:bg-hover"
    >
      <WorkspaceAvatar name={activeName} />
    </button>
  ) : (
    <button
      type="button"
      aria-label={`Switch workspace, current workspace: ${activeName}`}
      className="flex h-11 w-full items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors duration-150 ease-standard hover:bg-hover active:bg-pressed data-[state=open]:bg-hover"
    >
      <WorkspaceAvatar name={activeName} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-14 leading-tight font-medium">{activeName}</span>
        <span className="block truncate text-12 leading-tight text-muted-foreground">{plan}</span>
      </span>
      <ChevronsUpDown className="shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );

  return (
    <>
      <DropdownMenu>
        {collapsed ? (
          <ActionTooltip label={activeName} side="right">
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          </ActionTooltip>
        ) : (
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        )}
        <DropdownMenuContent
          align="start"
          side={collapsed ? 'right' : 'bottom'}
          className={cn('min-w-60', !collapsed && 'w-(--radix-dropdown-menu-trigger-width)')}
        >
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={active?.id ?? ''} onValueChange={setActiveWorkspaceId}>
            {workspaces.map((workspace) => (
              <DropdownMenuRadioItem key={workspace.id} value={workspace.id}>
                <WorkspaceAvatar name={workspace.name} size="sm" />
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                <span className="text-12 text-muted-foreground">{ROLE_LABELS[workspace.role]}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setCreating(true);
            }}
          >
            <Plus aria-hidden />
            Create workspace
          </DropdownMenuItem>
          {active && (
            <DropdownMenuItem asChild>
              <Link to="/app/settings/workspace" onClick={onNavigate}>
                <Settings aria-hidden />
                Workspace settings
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} onCreated={onNavigate} />
    </>
  );
}
