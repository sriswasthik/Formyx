import type { FormDetail } from '@formyx/shared';
import { ChevronDown, CirclePause, CirclePlay, LoaderCircle, Send, Share2 } from 'lucide-react';
import { ActionTooltip } from '@/components/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PublishAction } from './use-publishing';
import { useHasUnpublishedChanges } from './use-unpublished-changes';

interface PublishControlsProps {
  form: FormDetail;
  pending: PublishAction | null;
  onPublish: () => void;
  onShare: () => void;
  onClose: () => void;
  onReopen: () => void;
}

/** Publish, then share; and closing or reopening a live form. */
export function PublishControls({
  form,
  pending,
  onPublish,
  onShare,
  onClose,
  onReopen,
}: PublishControlsProps) {
  const changed = useHasUnpublishedChanges(form);
  const live = form.publishedSchema !== null;
  const closed = form.status === 'CLOSED';
  const busy = pending !== null;

  const primary = !live
    ? { label: 'Publish', icon: Send, onClick: onPublish }
    : changed
      ? { label: 'Publish changes', icon: Send, onClick: onPublish }
      : { label: 'Share', icon: Share2, onClick: onShare };
  const Icon = pending === 'publish' ? LoaderCircle : primary.icon;

  return (
    <div className="flex items-center gap-2">
      {closed && (
        <Badge variant="outline" className="hidden sm:inline-flex">
          Closed
        </Badge>
      )}
      {changed && (
        <Badge variant="warning" className="hidden md:inline-flex">
          Unpublished changes
        </Badge>
      )}

      <div className="flex items-center">
        <Button
          size="sm"
          className={live ? 'relative rounded-r-none' : 'relative'}
          disabled={busy}
          onClick={primary.onClick}
        >
          <Icon aria-hidden className={pending === 'publish' ? 'motion-safe:animate-spin' : ''} />
          <span className="sr-only sm:not-sr-only">{primary.label}</span>
          {changed && (
            // Small screens hide the badge; a dot on the button says the same.
            <span
              aria-hidden
              className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-background bg-warning md:hidden"
            />
          )}
        </Button>
        {live && (
          <DropdownMenu>
            <ActionTooltip label="More publishing options">
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="rounded-l-none border-l border-l-primary-foreground/20 px-2"
                  aria-label="More publishing options"
                  disabled={busy}
                >
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
            </ActionTooltip>
            <DropdownMenuContent align="end" className="w-48">
              {changed && (
                <DropdownMenuItem onSelect={onShare}>
                  <Share2 aria-hidden />
                  Share
                </DropdownMenuItem>
              )}
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
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
