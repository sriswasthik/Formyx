import { ShieldCheck } from 'lucide-react';
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

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the checks found: "asks for a password", and so on. */
  reasons: readonly string[];
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/** The reasons as one phrase: "asks for a password and mentions net banking". */
function joined(reasons: readonly string[]): string {
  if (reasons.length <= 1) return reasons[0] ?? 'needs a closer look';
  return `${reasons.slice(0, -1).join(', ')} and ${reasons.at(-1) ?? ''}`;
}

/**
 * Publishing held the form for review: why, and what happens now. Calm on purpose: most
 * forms held are perfectly fine, and a person will say so.
 */
export function ReviewDialog({ open, onOpenChange, reasons, returnFocusTo }: ReviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => {
          if (returnFocusTo?.current) {
            event.preventDefault();
            returnFocusTo.current.focus();
          }
        }}
      >
        <DialogHeader>
          <ShieldCheck className="size-5 text-accent" aria-hidden />
          <DialogTitle>We’re taking a quick look first</DialogTitle>
          <DialogDescription>
            This form {joined(reasons)}. Forms like that can be used to trick people, so someone at
            Formyx checks them before they go live.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2 text-14 text-muted-foreground">
          <li>It usually takes less than a day. There’s nothing you need to do.</li>
          <li>Until then, its link shows that the form is unavailable.</li>
          <li>If it doesn’t really ask for anything sensitive, reword it and publish again.</li>
        </ul>
        <DialogFooter>
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
