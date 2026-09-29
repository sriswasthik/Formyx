import { ChevronsUpDown, LogOut, Settings, SunMoon } from 'lucide-react';
import { Link } from 'react-router';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeRadioItems } from '@/features/theme/theme-toggle';

/** Stand-in identity until authentication lands. */
const PLACEHOLDER_USER = { name: 'Demo User', email: 'demo@formyx.app', initials: 'DU' };

export function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const user = PLACEHOLDER_USER;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${user.name}`}
          className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors duration-150 ease-standard hover:bg-hover active:bg-pressed data-[state=open]:bg-hover"
        >
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-12 font-medium"
          >
            {user.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-13 font-medium">{user.name}</span>
            <span className="block truncate text-12 text-muted-foreground">{user.email}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-52"
      >
        <DropdownMenuItem asChild onSelect={onNavigate}>
          <Link to="/settings">
            <Settings aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SunMoon aria-hidden />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <ThemeRadioItems />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <LogOut aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
