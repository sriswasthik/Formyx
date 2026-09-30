import type { FormSummary } from '@formyx/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { responseCountLabel } from './format';

interface DeleteFormDialogProps {
  /** The form being deleted; kept while the dialog animates out. */
  form: FormSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (form: FormSummary) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function DeleteFormDialog({
  form,
  open,
  onOpenChange,
  onDelete,
  onCloseAutoFocus,
}: DeleteFormDialogProps) {
  const responses = form?.responseCount ?? 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">Delete “{form?.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {responses > 0
              ? `This permanently deletes the form and its ${responseCountLabel(responses).toLowerCase()}. This can't be undone.`
              : "This permanently deletes the form. This can't be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (form) onDelete(form);
            }}
          >
            Delete form
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
