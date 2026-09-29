import { ChevronsUpDown, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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

/** Placeholder until workspaces exist: a single personal workspace. */
export function WorkspaceSwitcher() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch workspace, current workspace: Personal"
          className="flex h-9 w-full items-center gap-2 rounded-lg border bg-background px-2 text-left text-14 font-medium transition-colors duration-150 ease-standard hover:border-border-strong active:bg-pressed data-[state=open]:border-border-strong"
        >
          <span
            aria-hidden
            className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary text-12 font-semibold text-primary-foreground"
          >
            P
          </span>
          <span className="flex-1 truncate">Personal</span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-52"
      >
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuRadioGroup value="personal">
          <DropdownMenuRadioItem value="personal">Personal</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <Plus aria-hidden />
          Create workspace
          <Badge variant="outline" className="ml-auto">
            Soon
          </Badge>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
