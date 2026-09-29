import { Link } from 'react-router';
import { Logo } from '@/components/logo';
import { SidebarNav } from './sidebar-nav';
import { UserMenu } from './user-menu';
import { WorkspaceSwitcher } from './workspace-switcher';

interface SidebarProps {
  /** Distinguishes the desktop sidebar from the mobile sheet (animation scoping). */
  id: string;
  /** Called after a navigation, so the mobile sheet can close. */
  onNavigate?: () => void;
}

export function Sidebar({ id, onNavigate }: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link
          to="/forms"
          onClick={onNavigate}
          className="-m-1 rounded-md p-1"
          aria-label="Formyx, go to forms"
        >
          <Logo />
        </Link>
      </div>
      <div className="px-3">
        <WorkspaceSwitcher />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav id={id} onNavigate={onNavigate} />
      </div>
      <div className="border-t p-2">
        <UserMenu onNavigate={onNavigate} />
      </div>
    </div>
  );
}
