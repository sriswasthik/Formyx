import { formResponsesPath, type FormSummary } from '@formyx/shared';
import {
  Copy,
  ExternalLink,
  FolderOpen,
  Inbox,
  Link2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { formOpenPath, publicFormPath, publicFormUrl } from './form-paths';

export type FormAction = 'rename' | 'duplicate' | 'delete';

/** `trigger` is the menu button, so dialogs can hand focus back to it when they close. */
export type FormActionHandler = (
  action: FormAction,
  form: FormSummary,
  trigger: HTMLElement | null,
) => void;

interface FormActionsMenuProps {
  form: FormSummary;
  canEdit: boolean;
  onAction: FormActionHandler;
  className?: string;
}

export function FormActionsMenu({ form, canEdit, onAction, className }: FormActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Only ever called from event handlers, where reading the ref is safe.
  const run = (action: FormAction) => {
    onAction(action, form, triggerRef.current);
  };

  return (
    // Non-modal, so opening a dialog from the menu does not leave the page inert.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${form.title}`}
          className={cn('text-muted-foreground data-[state=open]:bg-hover', className)}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem asChild>
          <Link to={formOpenPath(form.id, canEdit)}>
            <FolderOpen aria-hidden />
            Open
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={formResponsesPath(form.id)}>
            <Inbox aria-hidden />
            Responses
          </Link>
        </DropdownMenuItem>
        {form.status === 'PUBLISHED' && (
          <>
            <DropdownMenuItem asChild>
              <a href={publicFormPath(form.slug)} target="_blank" rel="noopener">
                <ExternalLink aria-hidden />
                Preview
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                navigator.clipboard.writeText(publicFormUrl(form.slug)).then(
                  () => {
                    toast.success('Link copied');
                  },
                  () => {
                    toast.error('Could not copy the link');
                  },
                );
              }}
            >
              <Link2 aria-hidden />
              Copy link
            </DropdownMenuItem>
          </>
        )}
        {canEdit && (
          <>
            <DropdownMenuItem
              onSelect={() => {
                run('rename');
              }}
            >
              <Pencil aria-hidden />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                run('duplicate');
              }}
            >
              <Copy aria-hidden />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                run('delete');
              }}
            >
              <Trash2 aria-hidden />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
