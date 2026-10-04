import { FEATURES, type FeatureId } from '@formyx/shared';
import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProBadge } from './pro-badge';

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the plan lacks, as the shared registry names them. */
  features: readonly FeatureId[];
  /** Where focus goes on closing, e.g. the button that tried to publish. */
  returnFocusTo?: RefObject<HTMLElement>;
}

/**
 * Explains that publishing needs a Pro plan. There are no payments yet, so it says plans are
 * coming soon rather than offering checkout; the design stays as it is.
 */
export function UpgradeDialog({ open, onOpenChange, features, returnFocusTo }: UpgradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo?.current) return;
          event.preventDefault();
          returnFocusTo.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Pro plans are coming soon</DialogTitle>
          <DialogDescription>
            This form uses Pro styles. Keep designing with them; to publish today, switch them to
            free options in Design.
          </DialogDescription>
        </DialogHeader>
        <ul
          aria-label="Pro styles in this form"
          className="flex flex-col divide-y rounded-lg border"
        >
          {features.map((featureId) => (
            <li key={featureId} className="flex flex-col gap-0.5 px-3 py-2.5">
              <span className="flex items-center gap-2 text-14 font-medium">
                {FEATURES[featureId].name} <ProBadge />
              </span>
              <span className="text-13 text-muted-foreground">
                {FEATURES[featureId].description}
              </span>
            </li>
          ))}
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
