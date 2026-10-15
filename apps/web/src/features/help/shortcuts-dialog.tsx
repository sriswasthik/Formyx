import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EDITOR_SHORTCUTS } from '@/features/form-editor/editor-shortcuts';
import { APP_SHORTCUTS } from '@/features/shell/app-shortcuts';
import { formatShortcut, type Shortcut } from '@/lib/shortcuts';

interface ShortcutGroup {
  title: string;
  shortcuts: { label: string; keys: Shortcut[] }[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Anywhere',
    shortcuts: [
      { label: 'Search and commands', keys: [APP_SHORTCUTS.search] },
      { label: 'Collapse or open the sidebar', keys: [APP_SHORTCUTS.sidebar] },
    ],
  },
  {
    title: 'In the form editor, with a question selected',
    shortcuts: [
      { label: 'Undo', keys: [EDITOR_SHORTCUTS.undo] },
      { label: 'Redo', keys: [EDITOR_SHORTCUTS.redo, EDITOR_SHORTCUTS.redoAlternative] },
      { label: 'Duplicate the question', keys: [EDITOR_SHORTCUTS.duplicate] },
      {
        label: 'Delete the question',
        keys: [EDITOR_SHORTCUTS.remove, EDITOR_SHORTCUTS.removeAlternative],
      },
      { label: 'Deselect it', keys: [EDITOR_SHORTCUTS.deselect] },
    ],
  },
];

/** Every keyboard shortcut, from the help menu and the account menu. */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Faster ways around Formyx.</DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-4">
          {GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3 className="mb-2 text-12 font-medium text-muted-foreground">{group.title}</h3>
              <dl className="flex flex-col divide-y rounded-lg border">
                {group.shortcuts.map(({ label, keys }) => (
                  <div key={label} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <dt className="text-14">{label}</dt>
                    <dd className="flex gap-1.5">
                      {keys.map((shortcut) => (
                        <kbd
                          key={formatShortcut(shortcut)}
                          className="rounded-md border bg-muted px-1.5 py-0.5 font-sans text-12 tabular-nums"
                        >
                          {formatShortcut(shortcut)}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
