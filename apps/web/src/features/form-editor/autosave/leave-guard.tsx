import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router';
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
import type { Autosaver } from './autosaver';

/**
 * Leaving the editor inside the app saves first, then continues. Only if that save fails
 * does it ask whether to leave anyway.
 */
export function LeaveGuard({ autosaver }: { autosaver: Autosaver }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname && autosaver.hasUnsavedChanges(),
  );
  const [saveFailed, setSaveFailed] = useState(false);
  const blocked = blocker.state === 'blocked';

  useEffect(() => {
    if (!blocked) return;
    let cancelled = false;
    void autosaver.flush().then((saved) => {
      if (cancelled) return;
      if (saved) blocker.proceed();
      else setSaveFailed(true);
    });
    return () => {
      cancelled = true;
    };
    // The router keeps the same blocker object for as long as it stays blocked.
  }, [blocked, blocker, autosaver]);

  return (
    <AlertDialog
      open={blocked && saveFailed}
      onOpenChange={(open) => {
        if (!open) {
          setSaveFailed(false);
          blocker.reset?.();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
          <AlertDialogDescription>
            Your latest changes could not be saved. If you leave now, they will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setSaveFailed(false);
              blocker.proceed?.();
            }}
          >
            Leave anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
