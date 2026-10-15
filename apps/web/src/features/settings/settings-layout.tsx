import { hasRole, type Role } from '@formyx/shared';
import { NavLink, Outlet, useLocation } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { cn } from '@/lib/utils';

interface Section {
  to: string;
  label: string;
  /** The line under the page's title on this tab. */
  description: string;
  end?: boolean;
  role?: Role;
}

const SECTIONS: readonly Section[] = [
  {
    to: '/app/settings',
    label: 'Preferences',
    description: 'Your profile, how Formyx looks and your account.',
    end: true,
  },
  {
    to: '/app/settings/workspace',
    label: 'Workspace',
    description: 'The workspace’s name, defaults and danger zone.',
  },
  {
    to: '/app/settings/members',
    label: 'Members',
    description: 'Who is in the workspace, and what each of them can do.',
  },
  {
    to: '/app/settings/brand-kits',
    label: 'Brand kits',
    description: 'Colours, fonts and logos that new forms start from.',
  },
  {
    to: '/app/settings/billing',
    label: 'Billing',
    description: 'The workspace’s plan, usage and payments.',
    role: 'OWNER',
  },
  {
    to: '/app/settings/referrals',
    label: 'Referrals',
    description: 'Share Formyx and get a free month when a friend pays.',
  },
];

/** The settings pages: one header, tabs between them, and the page below. */
export function SettingsLayout() {
  const { pathname } = useLocation();
  const workspace = useActiveWorkspace();
  const sections = SECTIONS.filter(
    (section) => !section.role || (workspace && hasRole(workspace.role, section.role)),
  );
  const current =
    SECTIONS.find((section) =>
      section.end ? pathname === section.to : pathname.startsWith(section.to),
    ) ?? SECTIONS[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={current?.label ?? 'Settings'} description={current?.description} />
      <nav aria-label="Settings" className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
        <ul className="flex h-10 min-w-max gap-5 border-b">
          {sections.map(({ to, label, end }) => (
            <li key={to} className="h-full">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'relative -mb-px inline-flex h-10 items-center border-b-2 px-0.5 text-14 font-medium',
                    'transition-colors duration-150 ease-standard',
                    isActive
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="max-w-3xl">
        <Outlet />
      </div>
    </div>
  );
}
