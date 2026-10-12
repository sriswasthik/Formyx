import {
  isPaidPlan,
  PAID_PLANS,
  PLAN_LABELS,
  planIncludes,
  type BillingInterval,
  type BillingSummary,
  type PaidPlan,
  type Plan,
} from '@formyx/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IntervalToggle } from '@/features/pricing/interval-toggle';
import { PlanCards } from '@/features/pricing/plan-cards';
import { changeErrorMessage } from '@/lib/api';
import { CheckoutError } from './razorpay-checkout';
import { useChangePlan, useCheckout } from './use-billing';

/**
 * The paid plans, to buy one (Razorpay Checkout) or move between them. Moving up starts at
 * once; moving down waits for the end of the period already paid for.
 */
export function PlansCard({
  workspaceId,
  summary,
}: {
  workspaceId: string;
  summary: BillingSummary;
}) {
  const { subscription } = summary;
  const [interval, setBillingInterval] = useState<BillingInterval>(
    subscription?.interval ?? 'monthly',
  );
  const checkout = useCheckout(workspaceId);
  const change = useChangePlan(workspaceId);
  const [busy, setBusy] = useState<PaidPlan | null>(null);
  const running = subscription?.status === 'active' && !subscription.cancelAtPeriodEnd;
  // A plan on its way, retrying a payment, or set to end: nothing to choose until it settles.
  const waiting = subscription
    ? ['authenticated', 'pending', 'halted'].includes(subscription.status) ||
      (subscription.status === 'active' && subscription.cancelAtPeriodEnd)
    : false;

  const failed = (title: string) => (error: Error) => {
    setBusy(null);
    if (error instanceof CheckoutError && error.reason === 'dismissed') return;
    toast.error(title, {
      description: error instanceof CheckoutError ? error.message : changeErrorMessage(error),
    });
  };

  const choose = (plan: PaidPlan) => {
    setBusy(plan);
    if (running) {
      change.mutate(
        { plan, interval },
        {
          onSuccess: (next) => {
            setBusy(null);
            toast.success(
              next.plan === plan
                ? `You’re on ${PLAN_LABELS[plan]}`
                : `${PLAN_LABELS[plan]} starts when this period ends`,
            );
          },
          onError: failed('Could not change the plan'),
        },
      );
      return;
    }
    checkout.mutate(
      { kind: 'subscribe', plan, interval },
      {
        onSuccess: ({ confirmed }) => {
          setBusy(null);
          if (confirmed) toast.success(`Welcome to ${PLAN_LABELS[plan]}`);
          else
            toast.info('Payment received', {
              description: `${PLAN_LABELS[plan]} starts as soon as Razorpay confirms it.`,
            });
        },
        onError: failed('The upgrade didn’t go through'),
      },
    );
  };

  const action = (plan: Plan) => {
    if (!isPaidPlan(plan)) return null;
    const current = running && subscription.plan === plan && subscription.interval === interval;
    const label = current
      ? 'Your plan'
      : running
        ? planIncludes(plan, subscription.plan)
          ? `Switch to ${PLAN_LABELS[plan]}`
          : `Move to ${PLAN_LABELS[plan]}`
        : `Upgrade to ${PLAN_LABELS[plan]}`;
    return (
      <Button
        className="w-full"
        variant={current ? 'secondary' : 'primary'}
        disabled={current || waiting || busy !== null || !summary.checkoutAvailable}
        onClick={() => {
          choose(plan);
        }}
      >
        {busy === plan ? (running ? 'Changing…' : 'Waiting for payment…') : label}
      </Button>
    );
  };

  return (
    <Card id="plans">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Plans</CardTitle>
          <CardDescription>
            {!summary.checkoutAvailable
              ? 'Payments aren’t set up on this server yet.'
              : waiting
                ? 'Your plan is changing; you can choose another once it has.'
                : 'Prices in Indian rupees. Cancel any time.'}
          </CardDescription>
        </div>
        <IntervalToggle value={interval} onChange={setBillingInterval} />
      </CardHeader>
      <CardContent>
        <PlanCards
          interval={interval}
          plans={PAID_PLANS}
          current={running ? subscription.plan : undefined}
          action={action}
        />
      </CardContent>
    </Card>
  );
}
