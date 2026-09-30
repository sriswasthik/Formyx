import { LoaderCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface ConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReload: () => void;
  reloading: boolean;
}

/** Shown when someone else saved the form first, so this editor's changes were refused. */
export function ConflictDialog({ open, onOpenChange, onReload, reloading }: ConflictDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!reloading) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This form was changed somewhere else</AlertDialogTitle>
          <AlertDialogDescription>
            Someone saved a newer version while you were editing, so your latest changes were not
            saved. Load the latest version to keep editing. Your unsaved changes will be discarded.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={reloading}>Not now</AlertDialogCancel>
          <Button disabled={reloading} onClick={onReload}>
            {reloading && <LoaderCircle className="motion-safe:animate-spin" aria-hidden />}
            Load latest version
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
