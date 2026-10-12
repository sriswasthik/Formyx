import {
  PLAN_LABELS,
  type BillingInterval,
  type BillingSummary,
  type CancelInput,
  type Checkout,
  type PaidPlan,
} from '@formyx/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { entitlementKeys } from '@/features/entitlements/use-entitlements';
import {
  cancelPlan,
  changePlan,
  dismissDowngrade,
  getBilling,
  getPayments,
  resumePlan,
  subscribe,
  verifyCheckout,
} from './billing-api';
import { openCheckout } from './razorpay-checkout';

export const billingKeys = {
  summary: (workspaceId: string) => ['billing', workspaceId] as const,
  payments: (workspaceId: string) => ['billing', workspaceId, 'payments'] as const,
};

/** Where a workspace's billing stands. Owners only: the API refuses everyone else. */
export function useBilling(workspaceId: string | undefined, { enabled = true } = {}) {
  return useQuery({
    queryKey: billingKeys.summary(workspaceId ?? ''),
    queryFn: () => getBilling(workspaceId ?? ''),
    enabled: enabled && Boolean(workspaceId),
  });
}

export function usePayments(workspaceId: string) {
  return useQuery({
    queryKey: billingKeys.payments(workspaceId),
    queryFn: () => getPayments(workspaceId),
  });
}

/** After a plan changes, what the workspace may use changes with it. */
function refreshPlan(queryClient: QueryClient, workspaceId: string, summary?: BillingSummary) {
  if (summary) queryClient.setQueryData(billingKeys.summary(workspaceId), summary);
  void queryClient.invalidateQueries({ queryKey: billingKeys.summary(workspaceId) });
  void queryClient.invalidateQueries({ queryKey: entitlementKeys.workspace(workspaceId) });
}

export function useCancelPlan(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CancelInput) => cancelPlan(workspaceId, input),
    onSuccess: (summary) => {
      refreshPlan(queryClient, workspaceId, summary);
    },
  });
}

export function useChangePlan(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { plan: PaidPlan; interval: BillingInterval }) =>
      changePlan(workspaceId, input),
    onSuccess: (summary) => {
      refreshPlan(queryClient, workspaceId, summary);
    },
  });
}

export function useDismissDowngrade(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dismissDowngrade(workspaceId),
    onSuccess: () => {
      refreshPlan(queryClient, workspaceId);
    },
  });
}

const CONFIRM_POLL_MS = 1500;
const CONFIRM_TRIES = 20;

/** Waits for Razorpay's webhook to reach the server: the plan in force, or on its way. */
async function waitForConfirmation(workspaceId: string, subscriptionId: string) {
  for (let attempt = 0; attempt < CONFIRM_TRIES; attempt += 1) {
    const summary = await getBilling(workspaceId);
    const subscription = summary.subscription;
    if (
      subscription?.id === subscriptionId &&
      ['active', 'authenticated'].includes(subscription.status)
    ) {
      return { summary, confirmed: true };
    }
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
  }
  return { summary: await getBilling(workspaceId), confirmed: false };
}

export interface CheckoutOutcome {
  /** False when the webhook hasn't come yet: the payment went through, the plan follows. */
  confirmed: boolean;
  plan: PaidPlan;
}

/**
 * Buying a plan (or keeping one that is set to end): the server starts a subscription,
 * Razorpay Checkout takes the payment, the server checks Checkout's signature, and the plan
 * changes once Razorpay's webhook confirms it.
 */
export function useCheckout(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      request:
        { kind: 'subscribe'; plan: PaidPlan; interval: BillingInterval } | { kind: 'resume' },
    ): Promise<CheckoutOutcome> => {
      const checkout: Checkout =
        request.kind === 'resume'
          ? await resumePlan(workspaceId)
          : await subscribe(workspaceId, { plan: request.plan, interval: request.interval });
      const description = `${PLAN_LABELS[checkout.plan]}, ${checkout.interval === 'monthly' ? 'monthly' : 'yearly'}`;
      const paid = await openCheckout(checkout, description);
      await verifyCheckout(workspaceId, paid);
      const { summary, confirmed } = await waitForConfirmation(
        workspaceId,
        checkout.subscriptionId,
      );
      refreshPlan(queryClient, workspaceId, summary);
      void queryClient.invalidateQueries({ queryKey: billingKeys.payments(workspaceId) });
      return { confirmed, plan: checkout.plan };
    },
  });
}
