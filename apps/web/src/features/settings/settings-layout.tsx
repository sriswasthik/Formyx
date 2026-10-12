import { NavLink, Outlet } from 'react-router';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { to: '/app/settings', label: 'Preferences', end: true },
  { to: '/app/settings/workspace', label: 'Workspace', end: false },
  { to: '/app/settings/billing', label: 'Billing', end: false },
] as const;

/** Settings pages under one heading, with links between them. */
export function SettingsLayout() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <nav aria-label="Settings">
        <ul className="flex h-10 gap-5 border-b">
          {SECTIONS.map(({ to, label, end }) => (
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
      <Outlet />
    </div>
  );
}
