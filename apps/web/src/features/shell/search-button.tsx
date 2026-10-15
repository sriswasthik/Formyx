import { Search } from 'lucide-react';
import { ActionTooltip } from '@/components/action-tooltip';
import { usePaletteStore } from '@/features/command-palette/palette-store';
import { formatShortcut } from '@/lib/shortcuts';
import { APP_SHORTCUTS } from './app-shortcuts';

/** Looks like a search box; opens the command palette, as Ctrl/⌘ K does. */
export function SearchButton({ collapsed = false }: { collapsed?: boolean }) {
  const setOpen = usePaletteStore((state) => state.setOpen);
  const open = () => {
    setOpen(true);
  };

  if (collapsed) {
    return (
      <ActionTooltip label="Search" shortcut={APP_SHORTCUTS.search} side="right">
        <button
          type="button"
          aria-label="Search"
          aria-haspopup="dialog"
          onClick={open}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-standard hover:bg-hover hover:text-foreground active:bg-pressed"
        >
          <Search aria-hidden />
        </button>
      </ActionTooltip>
    );
  }

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={open}
      className="flex h-8 w-full items-center gap-2 rounded-md border bg-background px-2 text-13 text-muted-foreground transition-colors duration-150 ease-standard hover:border-border-strong active:bg-pressed"
    >
      <Search aria-hidden />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="rounded border bg-muted px-1 font-sans text-12 leading-4 text-subtle-foreground tabular-nums">
        {formatShortcut(APP_SHORTCUTS.search)}
      </kbd>
    </button>
  );
}
