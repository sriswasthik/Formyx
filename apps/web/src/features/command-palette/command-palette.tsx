import { Command, defaultFilter } from 'cmdk';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { usePaletteStore } from './palette-store';
import { readRecentCommands, rememberCommand } from './recent-commands';
import { COMMAND_GROUPS, useCommands, type PaletteCommand } from './use-commands';

const itemClass =
  'group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-14 text-foreground outline-none select-none data-[selected=true]:bg-hover [&_svg]:text-muted-foreground';

const groupClass =
  'px-2 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-12 [&_[cmdk-group-heading]]:text-muted-foreground';

/** The weakest match the palette still lists, out of 1. */
const MIN_SCORE = 0.05;

/**
 * Scores a command by its label and other words, not by its value (an id such as
 * "form:abc123", whose letters would make loose searches match nearly anything).
 */
function filterCommands(_value: string, search: string, keywords?: string[]): number {
  const [label = '', ...others] = keywords ?? [];
  const score = defaultFilter(label, search, others);
  // Scattered letters ("mem" in "Start from a template") are noise; typos ("membrs") are not.
  return score < MIN_SCORE ? 0 : score;
}

function CommandItem({
  command,
  value,
  showGroup = false,
  onRun,
}: {
  command: PaletteCommand;
  /** Unique per list, so a recent command and its own group's copy are told apart. */
  value: string;
  /** Names its group after the label, in the flat list of search results. */
  showGroup?: boolean;
  onRun: (command: PaletteCommand) => void;
}) {
  const Icon = command.icon;
  return (
    <Command.Item
      value={value}
      keywords={[command.label, ...(command.keywords ?? [])]}
      onSelect={() => {
        onRun(command);
      }}
      // Outside a group (search results) the item takes the group's inset itself.
      className={cn(itemClass, showGroup && 'mx-2')}
    >
      {command.color ? (
        <span
          aria-hidden
          className="mx-1 size-2 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
          style={{ background: command.color }}
        />
      ) : (
        <Icon className="shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate">{command.label}</span>
      {/* The labels say enough to a screen reader; the group is a visual hint. */}
      {showGroup && (
        <span
          aria-hidden
          className="shrink-0 text-12 text-muted-foreground group-data-[selected=true]:text-subtle-foreground"
        >
          {command.group}
        </span>
      )}
    </Command.Item>
  );
}

/**
 * Search and commands in one place: jump to a form or page, create a form, switch workspace
 * or theme, log out. Ctrl/⌘ K opens it from anywhere in the app. Arrow keys move, Enter runs;
 * the last few choices come first next time.
 */
export function CommandPalette() {
  const open = usePaletteStore((state) => state.open);
  const setOpen = usePaletteStore((state) => state.setOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search and commands</DialogTitle>
        <DialogDescription className="sr-only">
          Type to find a form, a page or an action.
        </DialogDescription>
        {open && (
          <PaletteBody
            onDone={() => {
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({ onDone }: { onDone: () => void }) {
  const commands = useCommands();
  const [search, setSearch] = useState('');
  const [recentIds] = useState(readRecentCommands);
  const recent = recentIds.flatMap((id) => commands.filter((command) => command.id === id));

  const run = (command: PaletteCommand) => {
    rememberCommand(command.id);
    onDone();
    command.run();
  };

  return (
    // No vim bindings: Ctrl K belongs to closing the palette, not moving up a row.
    <Command
      label="Search and commands"
      loop
      vimBindings={false}
      filter={filterCommands}
      className="flex flex-col"
    >
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <Search className="shrink-0 text-muted-foreground" aria-hidden />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Search forms, pages and actions…"
          className="h-full min-w-0 flex-1 bg-transparent text-14 outline-none placeholder:text-muted-foreground"
        />
        <kbd className="rounded border bg-muted px-1 font-sans text-12 leading-4 text-subtle-foreground">
          Esc
        </kbd>
      </div>
      <Command.List
        className={cn(
          'max-h-[min(60dvh,420px)] overflow-y-auto overscroll-contain pb-2',
          search !== '' && 'pt-2',
        )}
      >
        <Command.Empty className="px-4 py-8 text-center text-14 text-muted-foreground">
          Nothing matches “{search}”.
        </Command.Empty>
        {search === '' && recent.length > 0 && (
          <Command.Group heading="Recent" className={groupClass}>
            {recent.map((command) => (
              <CommandItem
                key={command.id}
                command={command}
                value={`recent:${command.id}`}
                onRun={run}
              />
            ))}
          </Command.Group>
        )}
        {/* Search results are one list, best match first: cmdk sorts items, not groups. */}
        {search !== '' &&
          commands.map((command) => (
            <CommandItem
              key={command.id}
              command={command}
              value={command.id}
              showGroup
              onRun={run}
            />
          ))}
        {search === '' &&
          COMMAND_GROUPS.map((group) => {
            const items = commands.filter((command) => command.group === group);
            if (items.length === 0) return null;
            return (
              <Command.Group key={group} heading={group} className={groupClass}>
                {items.map((command) => (
                  <CommandItem key={command.id} command={command} value={command.id} onRun={run} />
                ))}
              </Command.Group>
            );
          })}
      </Command.List>
    </Command>
  );
}
