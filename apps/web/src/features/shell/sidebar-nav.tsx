import { hasRole } from '@formyx/shared';
import { useId } from 'react';
import { Link, useLocation } from 'react-router';
import { useSession } from '@/features/auth/session-context';
import { formOpenPath } from '@/features/forms/form-paths';
import { useFormsList } from '@/features/forms/use-forms';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { cn } from '@/lib/utils';
import {
  ADMIN_NAV_ITEM,
  MAIN_NAV_ITEMS,
  visibleItems,
  WORKSPACE_NAV_ITEMS,
  type NavItem,
} from './nav-items';
import { SidebarLink } from './sidebar-link';

/** How many of the latest forms "Recent" lists. */
export const RECENT_FORMS = 5;

interface SidebarNavProps {
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}

function NavList({
  items,
  label,
  collapsed,
  onNavigate,
}: {
  items: readonly NavItem[];
  label: string;
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const { pathname } = useLocation();
  return (
    <ul aria-label={label} className={cn('flex flex-col gap-0.5', collapsed && 'items-center')}>
      {items.map((item) => (
        <li key={item.to}>
          <SidebarLink
            to={item.to}
            label={item.label}
            icon={item.icon}
            active={item.matches(pathname)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        </li>
      ))}
    </ul>
  );
}

/** A quiet label above a group of sidebar items. */
function SectionLabel({ children, id }: { children: string; id?: string }) {
  return (
    <p id={id} className="px-2 pb-1 text-12 text-muted-foreground">
      {children}
    </p>
  );
}

/** The five forms edited most recently, each with a dot in its look's main colour. */
function RecentForms({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const workspace = useActiveWorkspace();
  const { pathname } = useLocation();
  const labelId = useId();
  const { data } = useFormsList(workspace?.id ?? '');
  const recent = data?.forms.slice(0, RECENT_FORMS) ?? [];
  if (!workspace || recent.length === 0) return null;
  const canEdit = hasRole(workspace.role, 'EDITOR');

  return (
    <section aria-labelledby={labelId} className="mt-5">
      <SectionLabel id={labelId}>Recent</SectionLabel>
      <ul className="flex flex-col gap-0.5">
        {recent.map((form) => {
          const to = formOpenPath(form.id, canEdit);
          const active = pathname.startsWith(`/app/forms/${form.id}`);
          return (
            <li key={form.id}>
              <Link
                to={to}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-14 transition-colors duration-150 ease-standard',
                  active
                    ? 'bg-pressed text-foreground'
                    : 'text-muted-foreground hover:bg-hover hover:text-foreground active:bg-pressed',
                )}
              >
                <span
                  aria-hidden
                  className="ml-1 size-2 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                  style={{ background: form.theme.colors.primary }}
                />
                <span className="min-w-0 flex-1 truncate">{form.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The main pages, the workspace's, and the latest forms (not in the rail). */
export function SidebarNav({ collapsed, onNavigate }: SidebarNavProps) {
  const { user } = useSession();
  const workspace = useActiveWorkspace();
  const main = user.isAdmin ? [...MAIN_NAV_ITEMS, ADMIN_NAV_ITEM] : MAIN_NAV_ITEMS;
  const workspaceItems = visibleItems(WORKSPACE_NAV_ITEMS, workspace?.role);

  return (
    <nav aria-label="Main" className="flex flex-col">
      <NavList items={main} label="Pages" collapsed={collapsed} onNavigate={onNavigate} />
      {workspace && (
        <div className={cn('mt-5', collapsed && 'mt-3 border-t pt-3')}>
          {!collapsed && <SectionLabel>Workspace</SectionLabel>}
          <NavList
            items={workspaceItems}
            label="Workspace"
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        </div>
      )}
      {!collapsed && <RecentForms onNavigate={onNavigate} />}
    </nav>
  );
}
