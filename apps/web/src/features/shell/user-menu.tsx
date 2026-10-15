import { ChevronsUpDown, Keyboard, LogOut, SunMoon, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ActionTooltip } from '@/components/action-tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession } from '@/features/auth/session-context';
import { useLogOut } from '@/features/auth/use-session';
import { ShortcutsDialog } from '@/features/help/shortcuts-dialog';
import { ThemeRadioItems } from '@/features/theme/theme-toggle';
import { cn } from '@/lib/utils';
import { getInitials } from './initials';

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-12 font-medium"
    >
      {getInitials(name)}
    </span>
  );
}

interface UserMenuProps {
  collapsed?: boolean;
  onNavigate?: (() => void) | undefined;
}

/** Who is signed in, and their profile, appearance, shortcuts and logging out. */
export function UserMenu({ collapsed = false, onNavigate }: UserMenuProps) {
  const { user } = useSession();
  const logOut = useLogOut();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const trigger = (
    <button
      type="button"
      aria-label={`Account menu for ${user.name}`}
      className={cn(
        'flex items-center gap-2 rounded-lg text-left transition-colors duration-150 ease-standard hover:bg-hover active:bg-pressed data-[state=open]:bg-hover',
        collapsed ? 'size-8 justify-center' : 'w-full p-1.5',
      )}
    >
      <Avatar name={user.name} />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-13 font-medium">{user.name}</span>
            <span className="block truncate text-12 text-muted-foreground">{user.email}</span>
          </span>
          <ChevronsUpDown className="shrink-0 text-muted-foreground" aria-hidden />
        </>
      )}
    </button>
  );

  return (
    <>
      <DropdownMenu>
        {collapsed ? (
          <ActionTooltip label={user.name} side="right">
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          </ActionTooltip>
        ) : (
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        )}
        <DropdownMenuContent
          side={collapsed ? 'right' : 'top'}
          align={collapsed ? 'end' : 'start'}
          className={cn('min-w-56', !collapsed && 'w-(--radix-dropdown-menu-trigger-width)')}
        >
          {collapsed && (
            <>
              <DropdownMenuLabel className="flex flex-col">
                <span className="truncate text-13 font-medium">{user.name}</span>
                <span className="truncate text-12 font-normal text-muted-foreground">
                  {user.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem asChild onSelect={onNavigate}>
            <Link to="/app/settings">
              <UserRound aria-hidden />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SunMoon aria-hidden />
              Appearance
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <ThemeRadioItems />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            onSelect={() => {
              setShortcutsOpen(true);
            }}
          >
            <Keyboard aria-hidden />
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={logOut.isPending}
            onSelect={() => {
              logOut.mutate(undefined, {
                onError: () => {
                  toast.error('Could not log out', {
                    description: 'Check your connection and try again.',
                  });
                },
              });
            }}
          >
            <LogOut aria-hidden />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
