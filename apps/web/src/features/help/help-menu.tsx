import { BookOpen, CircleHelp, ExternalLink, Keyboard, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EDITOR_SHORTCUTS } from '@/features/form-editor/editor-shortcuts';
import { formatShortcut, type Shortcut } from '@/lib/shortcuts';
import { helpArticle } from './articles';
import { contextualHelp } from './help-context';

const SHORTCUTS: { label: string; shortcuts: Shortcut[] }[] = [
  { label: 'Undo', shortcuts: [EDITOR_SHORTCUTS.undo] },
  { label: 'Redo', shortcuts: [EDITOR_SHORTCUTS.redo, EDITOR_SHORTCUTS.redoAlternative] },
  { label: 'Duplicate the question', shortcuts: [EDITOR_SHORTCUTS.duplicate] },
  {
    label: 'Delete the question',
    shortcuts: [EDITOR_SHORTCUTS.remove, EDITOR_SHORTCUTS.removeAlternative],
  },
  { label: 'Deselect it', shortcuts: [EDITOR_SHORTCUTS.deselect] },
];

function ShortcutsDialog({
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
          <DialogDescription>In the form editor, with a question selected.</DialogDescription>
        </DialogHeader>
        <dl className="mt-2 flex flex-col divide-y rounded-lg border">
          {SHORTCUTS.map(({ label, shortcuts }) => (
            <div key={label} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <dt className="text-14">{label}</dt>
              <dd className="flex gap-1.5">
                {shortcuts.map((shortcut) => (
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
      </DialogContent>
    </Dialog>
  );
}

const sidebarItemClass =
  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-14 text-muted-foreground transition-colors duration-150 ease-standard hover:bg-hover hover:text-foreground active:bg-pressed data-[state=open]:bg-hover data-[state=open]:text-foreground';

/**
 * The "?" menu: articles about the page being used, the help centre, keyboard shortcuts and
 * a way to reach a person. `sidebar` is a row in the app's sidebar; `icon` a button for the
 * editor's top bar.
 */
export function HelpMenu({ variant }: { variant: 'sidebar' | 'icon' }) {
  const { pathname } = useLocation();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const articles = contextualHelp(pathname).flatMap((slug) => {
    const article = helpArticle(slug);
    return article ? [article] : [];
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === 'sidebar' ? (
            <button type="button" className={sidebarItemClass}>
              <CircleHelp aria-hidden />
              Help
            </button>
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label="Help">
              <CircleHelp aria-hidden />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={variant === 'sidebar' ? 'start' : 'end'}
          side={variant === 'sidebar' ? 'top' : 'bottom'}
          className="w-64"
        >
          {articles.length > 0 && (
            <>
              <DropdownMenuLabel className="text-12 font-medium text-muted-foreground">
                Help with this page
              </DropdownMenuLabel>
              {articles.map((article) => (
                <DropdownMenuItem key={article.slug} asChild>
                  <a href={`/help/${article.slug}`} target="_blank" rel="noopener">
                    <BookOpen aria-hidden />
                    <span className="flex-1">{article.title}</span>
                  </a>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem asChild>
            <a href="/help" target="_blank" rel="noopener">
              <BookOpen aria-hidden />
              <span className="flex-1">Help centre</span>
              <ExternalLink className="text-muted-foreground" aria-hidden />
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setShortcutsOpen(true);
            }}
          >
            <Keyboard aria-hidden />
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/contact">
              <Mail aria-hidden />
              Contact us
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
