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
import { formatCount } from '../format';

interface DeleteResponsesDialogProps {
  /** How many responses would go; kept while the dialog animates out. */
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}

export function DeleteResponsesDialog({
  count,
  open,
  onOpenChange,
  onDelete,
}: DeleteResponsesDialogProps) {
  const one = count === 1;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {one ? 'Delete this response?' : `Delete ${formatCount(count)} responses?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {one ? 'Its answers are' : 'Their answers are'} removed for everyone, and the summary no
            longer counts {one ? 'it' : 'them'}. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete}>
            {one ? 'Delete response' : `Delete ${formatCount(count)} responses`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
