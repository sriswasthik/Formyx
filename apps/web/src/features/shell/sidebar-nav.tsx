import { LayoutGroup, motion } from 'motion/react';
import { NavLink } from 'react-router';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';

interface SidebarNavProps {
  /** Namespaces the active-indicator animation so the desktop and mobile navs never share it. */
  id: string;
  onNavigate?: () => void;
}

export function SidebarNav({ id, onNavigate }: SidebarNavProps) {
  return (
    <nav aria-label="Main">
      <LayoutGroup id={id}>
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-8 items-center gap-2 rounded-md px-2 text-14 transition-colors duration-150 ease-standard',
                    isActive
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-hover hover:text-foreground active:bg-pressed',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active-item"
                        aria-hidden
                        className="absolute inset-0 rounded-md bg-pressed"
                        transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
                      />
                    )}
                    <Icon className="relative" aria-hidden />
                    <span className="relative">{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </LayoutGroup>
    </nav>
  );
}
