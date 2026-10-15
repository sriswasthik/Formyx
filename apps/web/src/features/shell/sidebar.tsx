import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Link } from 'react-router';
import { ActionTooltip } from '@/components/action-tooltip';
import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/utils';
import { APP_SHORTCUTS } from './app-shortcuts';
import { SearchButton } from './search-button';
import { SidebarExtras } from './sidebar-extras';
import { SidebarNav } from './sidebar-nav';
import { useSidebarStore } from './sidebar-store';
import { UsageCard } from './usage-card';
import { UserMenu } from './user-menu';
import { WorkspaceSwitcher } from './workspace-switcher';

interface SidebarProps {
  /** The 64px rail of icons (desktop only); otherwise the full sidebar. */
  collapsed?: boolean;
  /** Whether it can collapse: not in the mobile sheet. */
  collapsible?: boolean;
  /** Called after a navigation, so the mobile sheet can close. */
  onNavigate?: () => void;
}

function CollapseButton({ collapsed }: { collapsed: boolean }) {
  const toggle = useSidebarStore((state) => state.toggle);
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <ActionTooltip label={label} shortcut={APP_SHORTCUTS.sidebar} side="right">
      <button
        type="button"
        aria-label={label}
        aria-expanded={!collapsed}
        onClick={toggle}
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,opacity] duration-150 ease-standard hover:bg-hover hover:text-foreground active:bg-pressed',
          // Shown when the sidebar is hovered or focused, so it stays out of the way.
          !collapsed &&
            'opacity-0 group-hover/sidebar:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
        )}
      >
        <Icon aria-hidden />
      </button>
    </ActionTooltip>
  );
}

export function Sidebar({ collapsed = false, collapsible = false, onNavigate }: SidebarProps) {
  return (
    <div className="group/sidebar flex h-full flex-col">
      <div
        className={cn(
          'flex h-14 shrink-0 items-center',
          collapsed ? 'h-auto flex-col justify-center gap-1 pt-3' : 'justify-between pr-2 pl-4',
        )}
      >
        <Link
          to="/app/forms"
          onClick={onNavigate}
          className="-m-1 rounded-md p-1"
          aria-label="Formyx, go to forms"
        >
          <Logo variant={collapsed ? 'icon' : 'full'} decorative />
        </Link>
        {collapsible && <CollapseButton collapsed={collapsed} />}
      </div>
      <div className={cn('flex flex-col gap-2', collapsed ? 'items-center px-0 pt-2' : 'px-3')}>
        <WorkspaceSwitcher collapsed={collapsed} onNavigate={onNavigate} />
        <SearchButton collapsed={collapsed} />
      </div>
      <div
        className={cn('flex-1 overflow-y-auto py-4', collapsed ? 'flex justify-center' : 'px-3')}
      >
        <SidebarNav collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      {!collapsed && (
        <div className="px-3 pb-3">
          <UsageCard onNavigate={onNavigate} />
        </div>
      )}
      <div className={cn('pb-3', collapsed ? 'flex justify-center' : 'px-3')}>
        <SidebarExtras collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      <div className={cn('border-t p-2', collapsed && 'flex justify-center')}>
        <UserMenu collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
