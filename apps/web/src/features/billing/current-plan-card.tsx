import { PLAN_LABELS, type BillingSummary } from '@formyx/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { changeErrorMessage } from '@/lib/api';
import { daysLeft, formatBillingDate } from './billing-format';
import { CancelDialog } from './cancel-dialog';
import { CheckoutError } from './razorpay-checkout';
import { useCheckout } from './use-billing';

/** One sentence on where the plan stands: a trial, the next charge, a plan set to end. */
function planStatus(summary: BillingSummary): {
  text: string;
  badge?: { label: string; tone: 'success' | 'warning' | 'neutral' };
} {
  const { subscription } = summary;
  if (summary.planStatus === 'PAST_DUE' && summary.graceEndsAt) {
    return {
      text: `The last payment didn’t go through. Razorpay is trying again; ${PLAN_LABELS[summary.plan]} keeps working until ${formatBillingDate(summary.graceEndsAt)}.`,
      badge: { label: 'Payment failed', tone: 'warning' },
    };
  }
  if (summary.complimentaryPlan && summary.complimentaryUntil) {
    return {
      text: `Complimentary until ${formatBillingDate(summary.complimentaryUntil)}.`,
      badge: { label: 'Complimentary', tone: 'neutral' },
    };
  }
  if (summary.planStatus === 'TRIALING' && summary.trialEndsAt) {
    const days = daysLeft(summary.trialEndsAt);
    const waiting = subscription?.status === 'authenticated';
    return {
      text: waiting
        ? `Your trial runs until ${formatBillingDate(summary.trialEndsAt)}; your plan starts then.`
        : `${days === 1 ? '1 day' : `${String(days)} days`} left, until ${formatBillingDate(summary.trialEndsAt)}. No card needed until you choose a plan.`,
      badge: { label: 'Trial', tone: 'neutral' },
    };
  }
  if (subscription?.status === 'active' && subscription.currentPeriodEnd) {
    return subscription.cancelAtPeriodEnd
      ? {
          text: `Ends on ${formatBillingDate(subscription.currentPeriodEnd)}. You won’t be charged again.`,
          badge: { label: 'Ending', tone: 'warning' },
        }
      : {
          text: `Renews on ${formatBillingDate(subscription.currentPeriodEnd)}, ${subscription.interval}.`,
          badge: { label: 'Active', tone: 'success' },
        };
  }
  return { text: 'Free forever, with the essentials. Upgrade any time for more.' };
}

export function CurrentPlanCard({
  workspaceId,
  summary,
}: {
  workspaceId: string;
  summary: BillingSummary;
}) {
  const [cancelling, setCancelling] = useState(false);
  const resume = useCheckout(workspaceId);
  const { subscription } = summary;
  const status = planStatus(summary);
  // A subscription that runs, or is on its way: it can be cancelled, or resumed if set to end.
  const running =
    subscription && ['active', 'authenticated', 'pending', 'halted'].includes(subscription.status)
      ? subscription
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {PLAN_LABELS[summary.effectivePlan]}
          {status.badge && (
            <Badge
              variant={
                status.badge.tone === 'success'
                  ? 'success'
                  : status.badge.tone === 'warning'
                    ? 'warning'
                    : 'outline'
              }
            >
              {status.badge.label}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{status.text}</CardDescription>
      </CardHeader>
      {running && (
        <CardContent className="flex flex-wrap gap-2">
          {running.cancelAtPeriodEnd ? (
            <Button
              disabled={resume.isPending || !summary.checkoutAvailable}
              onClick={() => {
                resume.mutate(
                  { kind: 'resume' },
                  {
                    onSuccess: () => {
                      toast.success(`${PLAN_LABELS[running.plan]} will carry on`);
                    },
                    onError: (error) => {
                      if (error instanceof CheckoutError && error.reason === 'dismissed') return;
                      toast.error('Could not resume the plan', {
                        description:
                          error instanceof CheckoutError
                            ? error.message
                            : changeErrorMessage(error),
                      });
                    },
                  },
                );
              }}
            >
              {resume.isPending ? 'Waiting for payment…' : `Resume ${PLAN_LABELS[running.plan]}`}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                setCancelling(true);
              }}
            >
              Cancel plan
            </Button>
          )}
          <CancelDialog
            workspaceId={workspaceId}
            subscription={running}
            open={cancelling}
            onOpenChange={setCancelling}
          />
        </CardContent>
      )}
    </Card>
  );
}
