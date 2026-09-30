import type { ValidationIssue } from '@formyx/shared';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEditorStore } from '../editor-store-context';

interface PublishIssuesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Issues with draft paths, such as `draftSchema.fields.2.label`. */
  issues: readonly ValidationIssue[];
  /** Takes the user to the question at `index`. */
  onShow: (index: number) => void;
}

function questionIndex(issue: ValidationIssue): number | null {
  const match = /^draftSchema\.fields\.(\d+)\./.exec(issue.path);
  return match ? Number(match[1]) : null;
}

/** What the draft still needs before it can go live, each linking to its question. */
export function PublishIssuesDialog({
  open,
  onOpenChange,
  issues,
  onShow,
}: PublishIssuesDialogProps) {
  const fields = useEditorStore((state) => state.schema.fields);
  const count = issues.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Finish the form to publish it</DialogTitle>
          <DialogDescription>
            {count === 1
              ? 'One thing needs fixing before respondents can see it.'
              : `${count} things need fixing before respondents can see it.`}
          </DialogDescription>
        </DialogHeader>
        <ul aria-label="Things to fix" className="-mx-2 flex max-h-80 flex-col overflow-y-auto">
          {issues.map((issue) => {
            const index = questionIndex(issue);
            const field = index === null ? undefined : fields[index];
            const where =
              index === null
                ? 'The form'
                : `Question ${index + 1}: ${field?.label.trim() || 'Untitled question'}`;
            return (
              <li key={`${issue.path}:${issue.message}`}>
                {index === null ? (
                  <div className="flex flex-col gap-0.5 px-2 py-2.5">
                    <span className="text-14 font-medium">{where}</span>{' '}
                    <span className="text-13 text-muted-foreground">{issue.message}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors duration-150 ease-standard hover:bg-muted"
                    onClick={() => {
                      onShow(index);
                    }}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-14 font-medium">{where}</span>{' '}
                      <span className="text-13 text-muted-foreground">{issue.message}</span>
                    </span>
                    <ChevronRight aria-hidden className="shrink-0 text-muted-foreground" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Keep editing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
