import {
  CANCEL_REASON_LABELS,
  CANCEL_REASONS,
  PLAN_LABELS,
  type CancelReason,
  type SubscriptionSummary,
} from '@formyx/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { changeErrorMessage } from '@/lib/api';
import { formatBillingDate } from './billing-format';
import { useCancelPlan } from './use-billing';

/** Cancelling: the plan runs to the end of the paid period. Why is asked, never required. */
export function CancelDialog({
  workspaceId,
  subscription,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  subscription: SubscriptionSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cancel = useCancelPlan(workspaceId);
  const [reason, setReason] = useState<CancelReason | undefined>();
  const [details, setDetails] = useState('');
  const plan = PLAN_LABELS[subscription.plan];
  const until =
    subscription.status === 'active' && subscription.currentPeriodEnd
      ? formatBillingDate(subscription.currentPeriodEnd)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel {plan}?</DialogTitle>
          <DialogDescription>
            {until
              ? `${plan} keeps working until ${until}, and you won’t be charged again. You can resume it any time before then.`
              : `${plan} ends now and you won’t be charged.`}{' '}
            Your forms and responses stay as they are.
          </DialogDescription>
        </DialogHeader>
        <form
          id="cancel-plan"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            cancel.mutate(
              { ...(reason && { reason }), ...(details.trim() && { details: details.trim() }) },
              {
                onSuccess: () => {
                  onOpenChange(false);
                  toast.success(until ? `${plan} ends on ${until}` : `${plan} cancelled`);
                },
                onError: (error) => {
                  toast.error('Could not cancel the plan', {
                    description: changeErrorMessage(error),
                  });
                },
              },
            );
          }}
        >
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-14 font-medium">
              Why are you leaving?{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </legend>
            <RadioGroup
              value={reason ?? ''}
              onValueChange={(value) => {
                setReason(value as CancelReason);
              }}
              className="flex flex-col gap-2.5"
            >
              {CANCEL_REASONS.map((value) => (
                <div key={value} className="flex items-center gap-2.5">
                  <RadioGroupItem id={`cancel-${value}`} value={value} />
                  <Label htmlFor={`cancel-${value}`} className="text-14 font-normal">
                    {CANCEL_REASON_LABELS[value]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cancel-details">Anything else? (optional)</Label>
            <Textarea
              id="cancel-details"
              rows={3}
              maxLength={500}
              value={details}
              onChange={(event) => {
                setDetails(event.target.value);
              }}
            />
          </div>
        </form>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Keep {plan}
          </Button>
          <Button
            type="submit"
            form="cancel-plan"
            variant="destructive"
            disabled={cancel.isPending}
          >
            {cancel.isPending ? 'Cancelling…' : `Cancel ${plan}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
