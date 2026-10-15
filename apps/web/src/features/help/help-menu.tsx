import { BookOpen, CircleHelp, ExternalLink, Keyboard, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ActionTooltip } from '@/components/action-tooltip';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { helpArticle } from './articles';
import { contextualHelp } from './help-context';
import { ShortcutsDialog } from './shortcuts-dialog';

const sidebarItemClass =
  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-14 text-muted-foreground transition-colors duration-150 ease-standard hover:bg-hover hover:text-foreground active:bg-pressed data-[state=open]:bg-hover data-[state=open]:text-foreground';

/**
 * The "?" menu: articles about the page being used, the help centre, keyboard shortcuts and
 * a way to reach a person. `sidebar` is a row in the app's sidebar, `rail` a button in the
 * collapsed sidebar, and `icon` a button for the editor's top bar.
 */
export function HelpMenu({ variant }: { variant: 'sidebar' | 'rail' | 'icon' }) {
  const { pathname } = useLocation();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const articles = contextualHelp(pathname).flatMap((slug) => {
    const article = helpArticle(slug);
    return article ? [article] : [];
  });

  return (
    <>
      <DropdownMenu>
        {variant === 'sidebar' ? (
          <DropdownMenuTrigger asChild>
            <button type="button" className={sidebarItemClass}>
              <CircleHelp aria-hidden />
              Help
            </button>
          </DropdownMenuTrigger>
        ) : variant === 'rail' ? (
          <ActionTooltip label="Help" side="right">
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Help"
                className="text-muted-foreground hover:text-foreground"
              >
                <CircleHelp aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          </ActionTooltip>
        ) : (
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Help">
              <CircleHelp aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        )}
        <DropdownMenuContent
          align={variant === 'icon' ? 'end' : 'start'}
          side={variant === 'sidebar' ? 'top' : variant === 'rail' ? 'right' : 'bottom'}
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
