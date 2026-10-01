import { formResponsesPath } from '@formyx/shared';
import { Check, ChevronDown, Eye, Inbox, Share2, SquarePen, type LucideIcon } from 'lucide-react';
import type { Ref } from 'react';
import { Link } from 'react-router';
import { ActionTooltip } from '@/components/action-tooltip';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { formOpenPath } from './form-paths';

export type FormSection = 'edit' | 'responses';

/** Below this width the sections fold into a menu, leaving the top bar room for the title. */
export const INLINE_FORM_NAV_QUERY = '(min-width: 768px)';

interface Section {
  id: FormSection;
  label: string;
  to: string;
  icon: LucideIcon;
}

function sections(formId: string, canEdit: boolean): Section[] {
  return [
    // Viewers cannot edit; their way into the questions is the read-only overview.
    canEdit
      ? { id: 'edit', label: 'Edit', to: formOpenPath(formId, true), icon: SquarePen }
      : { id: 'edit', label: 'Overview', to: formOpenPath(formId, false), icon: Eye },
    { id: 'responses', label: 'Responses', to: formResponsesPath(formId), icon: Inbox },
  ];
}

export interface FormNavProps {
  formId: string;
  current: FormSection;
  canEdit: boolean;
  /** Share needs a public link, which a form only has once it is published. */
  published: boolean;
  onShare: () => void;
  /** The inline Share button, so the share dialog can hand focus back to it. */
  shareRef?: Ref<HTMLButtonElement>;
}

function InlineNav({ formId, current, canEdit, published, onShare, shareRef }: FormNavProps) {
  return (
    <nav aria-label="Form" className="flex items-center gap-2">
      <ul className="flex h-9 items-center gap-0.5 rounded-lg border bg-background p-0.5">
        {sections(formId, canEdit).map((section) => (
          <li key={section.id} className="h-full">
            <Link
              to={section.to}
              aria-current={section.id === current ? 'page' : undefined}
              className={cn(
                'inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-13 font-medium text-muted-foreground',
                'transition-colors duration-150 ease-standard',
                'hover:bg-hover hover:text-foreground active:bg-pressed',
                'aria-[current=page]:bg-pressed aria-[current=page]:text-foreground',
              )}
            >
              <section.icon aria-hidden />
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
      <ShareButton published={published} onShare={onShare} shareRef={shareRef} />
    </nav>
  );
}

function ShareButton({
  published,
  onShare,
  shareRef,
}: Pick<FormNavProps, 'published' | 'onShare' | 'shareRef'>) {
  const button = (
    <Button
      ref={shareRef}
      variant="ghost"
      size="sm"
      aria-haspopup="dialog"
      // Still focusable while unavailable, so the tooltip can say why.
      aria-disabled={published ? undefined : true}
      onClick={() => {
        if (published) onShare();
      }}
    >
      <Share2 aria-hidden />
      Share
    </Button>
  );
  return published ? (
    button
  ) : (
    <ActionTooltip label="Publish the form to get a link to share">{button}</ActionTooltip>
  );
}

function MenuNav({ formId, current, canEdit, published, onShare }: FormNavProps) {
  const all = sections(formId, canEdit);
  const active = all.find((section) => section.id === current) ?? all[0];

  return (
    <nav aria-label="Form">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1 px-2">
            {active && <active.icon aria-hidden />}
            <span className="sr-only">Form section: </span>
            <span className="hidden sm:inline">{active?.label}</span>
            <span className="sr-only sm:hidden">{active?.label}</span>
            <ChevronDown aria-hidden className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {all.map((section) => (
            <DropdownMenuItem key={section.id} asChild>
              <Link to={section.to} aria-current={section.id === current ? 'page' : undefined}>
                <section.icon aria-hidden />
                <span className="flex-1">{section.label}</span>
                {section.id === current && <Check aria-hidden />}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!published} onSelect={onShare}>
            <Share2 aria-hidden />
            {published ? 'Share' : 'Share (publish first)'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

/** A form's sections (Edit, Responses) and its Share action, for the form's top bar. */
export function FormNav(props: FormNavProps) {
  const inline = useMediaQuery(INLINE_FORM_NAV_QUERY);
  return inline ? <InlineNav {...props} /> : <MenuNav {...props} />;
}
