import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';
import { Link } from 'react-router';
import { ActionTooltip } from '@/components/action-tooltip';
import { cn } from '@/lib/utils';
import { sidebarRowClass } from './sidebar-row';

interface SidebarLinkProps {
  to: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
  /** After the label, such as a dot for news. */
  trailing?: React.ReactNode;
}

export function SidebarLink({
  to,
  label,
  icon: Icon,
  active,
  collapsed,
  onNavigate,
  trailing,
}: SidebarLinkProps) {
  const link = (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(sidebarRowClass(active, collapsed), 'relative')}
    >
      <Icon className="shrink-0" aria-hidden />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {trailing}
    </Link>
  );
  return collapsed ? (
    <ActionTooltip label={label} side="right">
      {link}
    </ActionTooltip>
  ) : (
    link
  );
}
