import type { FormDetail } from '@formyx/shared';
import {
  ChevronDown,
  CirclePause,
  CirclePlay,
  ExternalLink,
  LoaderCircle,
  Send,
} from 'lucide-react';
import { useState, type Ref } from 'react';
import { ActionTooltip } from '@/components/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { publicFormPath } from '@/features/forms/form-paths';
import { cn } from '@/lib/utils';
import type { PublishAction } from './use-publishing';
import { useHasUnpublishedChanges } from './use-unpublished-changes';

interface PublishControlsProps {
  form: FormDetail;
  pending: PublishAction | null;
  /** The main button, so dialogs opened from it can give focus back. */
  primaryRef?: Ref<HTMLButtonElement>;
  onPublish: () => void;
  onClose: () => void;
  onReopen: () => void;
}

interface MenuProps {
  form: FormDetail;
  closed: boolean;
  onClose: () => void;
  onReopen: () => void;
}

/** Closing or reopening a live form, and a look at what respondents see. */
function LiveFormMenuItems({ form, closed, onClose, onReopen }: MenuProps) {
  return (
    <>
      {closed ? (
        <DropdownMenuItem onSelect={onReopen}>
          <CirclePlay aria-hidden />
          Reopen form
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem onSelect={onClose}>
          <CirclePause aria-hidden />
          Close form
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <a href={publicFormPath(form.slug)} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden />
          Open public form
        </a>
      </DropdownMenuItem>
    </>
  );
}

/**
 * Publishing a draft, or the changes made since; once everything is live, the form's state
 * (published or closed) with closing and reopening. Sharing lives in the form's navigation.
 */
export function PublishControls({
  form,
  pending,
  primaryRef,
  onPublish,
  onClose,
  onReopen,
}: PublishControlsProps) {
  const changed = useHasUnpublishedChanges(form);
  const [menuOpen, setMenuOpen] = useState(false);
  const live = form.publishedSchema !== null;
  const closed = form.status === 'CLOSED';
  const busy = pending !== null;
  const menuProps = { form, closed, onClose, onReopen };

  if (live && !changed) {
    // Nothing to publish: the button names the form's state and holds what can be done with it.
    return (
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open && !busy);
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            ref={primaryRef}
            variant="secondary"
            size="sm"
            aria-disabled={busy || undefined}
            aria-label={closed ? 'Closed: publishing options' : 'Published: publishing options'}
          >
            {busy ? (
              <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
            ) : (
              <span
                aria-hidden
                className={cn('size-2 rounded-full', closed ? 'bg-control' : 'bg-success')}
              />
            )}
            <span className="hidden sm:inline">{closed ? 'Closed' : 'Published'}</span>
            <ChevronDown aria-hidden className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <LiveFormMenuItems {...menuProps} />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const label = live ? 'Publish changes' : 'Publish';
  const Icon = pending === 'publish' ? LoaderCircle : Send;

  return (
    <div className="flex items-center gap-2">
      {closed && (
        <Badge variant="outline" className="hidden sm:inline-flex">
          Closed
        </Badge>
      )}
      {changed && live && (
        <Badge variant="warning" className="hidden md:inline-flex">
          Unpublished changes
        </Badge>
      )}

      <div className="flex items-center">
        {/* aria-disabled rather than disabled while busy, so keyboard focus stays put. */}
        <Button
          ref={primaryRef}
          size="sm"
          className={live ? 'relative rounded-r-none' : 'relative'}
          aria-disabled={busy || undefined}
          onClick={() => {
            if (!busy) onPublish();
          }}
        >
          <Icon aria-hidden className={pending === 'publish' ? 'motion-safe:animate-spin' : ''} />
          <span className="sr-only sm:not-sr-only">{label}</span>
          {changed && live && (
            // Small screens hide the badge; a dot on the button says the same.
            <span
              aria-hidden
              className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-background bg-warning md:hidden"
            />
          )}
        </Button>
        {live && (
          <DropdownMenu
            open={menuOpen}
            onOpenChange={(open) => {
              setMenuOpen(open && !busy);
            }}
          >
            <ActionTooltip label="More publishing options">
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="rounded-l-none border-l border-l-primary-foreground/20 px-2"
                  aria-label="More publishing options"
                  aria-disabled={busy || undefined}
                >
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
            </ActionTooltip>
            <DropdownMenuContent align="end" className="w-48">
              <LiveFormMenuItems {...menuProps} />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
