import {
  FEATURES,
  higherPlan,
  PLAN_LABELS,
  type BillingInterval,
  type FeatureId,
  type PaidPlan,
} from '@formyx/shared';
import { useState, type RefObject } from 'react';
import { Link } from 'react-router';
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
import { CheckoutError } from '@/features/billing/razorpay-checkout';
import { useBilling, useCheckout } from '@/features/billing/use-billing';
import { IntervalToggle } from '@/features/pricing/interval-toggle';
import { PlanPrice } from '@/features/pricing/plan-price';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { changeErrorMessage } from '@/lib/api';
import { ProBadge } from './pro-badge';
import { useUpgradeStore } from './upgrade-store';

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the plan lacks, as the shared registry names them. */
  features: readonly FeatureId[];
  /** Where focus goes on closing, e.g. the button that tried to publish. */
  returnFocusTo?: RefObject<HTMLElement>;
}

/** The least paid plan that includes every feature in `features`. */
function planFor(features: readonly FeatureId[]): PaidPlan {
  return features.reduce<PaidPlan>(
    (plan, featureId) => higherPlan(plan, FEATURES[featureId].minPlan) as PaidPlan,
    'PRO',
  );
}

/**
 * What a plan would add, and the way to buy it: owners go through Razorpay Checkout here;
 * other members are told to ask an owner. A workspace that already pays changes plan in its
 * billing settings.
 */
export function UpgradeDialog({ open, onOpenChange, features, returnFocusTo }: UpgradeDialogProps) {
  const workspace = useActiveWorkspace();
  const owner = workspace?.role === 'OWNER';
  const plan = planFor(features);
  const [interval, setBillingInterval] = useState<BillingInterval>('monthly');
  const billing = useBilling(workspace?.id, { enabled: open && owner });
  const checkout = useCheckout(workspace?.id ?? '');
  const subscription = billing.data?.subscription;
  const paying =
    subscription &&
    ['active', 'authenticated', 'pending', 'halted'].includes(subscription.status) &&
    !subscription.cancelAtPeriodEnd;

  const upgrade = () => {
    checkout.mutate(
      { kind: 'subscribe', plan, interval },
      {
        onSuccess: ({ confirmed }) => {
          onOpenChange(false);
          if (confirmed) toast.success(`Welcome to ${PLAN_LABELS[plan]}`);
          else
            toast.info('Payment received', {
              description: `${PLAN_LABELS[plan]} starts as soon as Razorpay confirms it, usually in a moment.`,
            });
        },
        onError: (error) => {
          if (error instanceof CheckoutError && error.reason === 'dismissed') return;
          toast.error('The upgrade didn’t go through', {
            description: error instanceof CheckoutError ? error.message : changeErrorMessage(error),
          });
        },
      },
    );
  };

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
          <DialogTitle>Upgrade to {PLAN_LABELS[plan]}</DialogTitle>
          <DialogDescription>
            {features.length > 0
              ? `Keep designing with these; publishing them takes ${PLAN_LABELS[plan]}.`
              : `Everything in your plan, and more.`}
          </DialogDescription>
        </DialogHeader>
        {features.length > 0 && (
          <ul
            aria-label={`${PLAN_LABELS[plan]} features in this form`}
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
        )}
        {owner && !paying && (
          <div className="flex flex-col gap-3">
            <IntervalToggle value={interval} onChange={setBillingInterval} />
            <PlanPrice plan={plan} interval={interval} />
          </div>
        )}
        <p className="text-13 text-muted-foreground" role="status">
          {!owner
            ? 'Only a workspace owner can change the plan. Ask one to upgrade.'
            : paying
              ? 'This workspace already has a plan: change it in Billing.'
              : billing.data && !billing.data.checkoutAvailable
                ? 'Payments aren’t set up on this server yet.'
                : null}
        </p>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Not now
          </Button>
          {owner && paying ? (
            <Button asChild>
              <Link to="/app/settings/billing">Go to billing</Link>
            </Button>
          ) : owner ? (
            <Button
              onClick={upgrade}
              disabled={checkout.isPending || !billing.data?.checkoutAvailable}
            >
              {checkout.isPending ? 'Waiting for payment…' : `Upgrade to ${PLAN_LABELS[plan]}`}
            </Button>
          ) : (
            <Button asChild variant="secondary">
              <Link to="/pricing">See plans</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The upgrade dialog Pro badges open, anywhere in the app. */
export function UpgradeDialogHost() {
  const features = useUpgradeStore((state) => state.features);
  const close = useUpgradeStore((state) => state.closeUpgrade);
  return (
    <UpgradeDialog
      open={features !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      features={features ?? []}
    />
  );
}
