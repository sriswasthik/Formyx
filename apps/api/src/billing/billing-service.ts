import {
  PLAN_LABELS,
  planIncludes,
  PRICES,
  resolveEntitlements,
  type BillingInterval,
  type BillingSummary,
  type CancelInput,
  type Checkout,
  type PaidPlan,
  type PaymentsResponse,
  type SubscribeInput,
  type SubscriptionSummary,
  type VerifyCheckoutInput,
  type VerifyCheckoutResponse,
} from '@formyx/shared';
import type { Env } from '../config/env.js';
import type { $Enums } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
import { WORKSPACE_BILLING_SELECT } from '../services/entitlement-service.js';
import { downgradedForms } from './downgrade.js';
import { activatePlan } from './plan-changes.js';
import {
  billingConfigured,
  checkoutSignatureValid,
  planForRazorpayPlan,
  razorpayPlanIds,
  RazorpayError,
  TOTAL_COUNT,
  type RazorpayClient,
} from './razorpay.js';
import { workspaceUsage } from './usage.js';

/*
 * What a workspace's owner does with billing: see where it stands, buy a plan through Razorpay
 * Checkout, cancel at the end of the period, resume and change plans. Each call to Razorpay is
 * the server's own; the plan itself changes when Razorpay's webhook says so.
 */

/** Subscriptions that are running, or on their way (bought during a trial, starting later). */
const RUNNING: $Enums.SubscriptionStatus[] = ['AUTHENTICATED', 'ACTIVE', 'PENDING', 'HALTED'];

const INTERVAL: Record<$Enums.BillingInterval, BillingInterval> = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
};
const STORED_INTERVAL: Record<BillingInterval, $Enums.BillingInterval> = {
  monthly: 'MONTHLY',
  yearly: 'YEARLY',
};

/** A trial must have at least this long left to start a bought plan when it ends. */
const MIN_DEFERRED_START_MS = 60 * 60 * 1000;

export type BillingEnv = Pick<
  Env,
  | 'ENTITLEMENTS_MODE'
  | 'ENFORCEMENT_MODE'
  | 'RAZORPAY_KEY_ID'
  | 'RAZORPAY_KEY_SECRET'
  | 'RAZORPAY_WEBHOOK_SECRET'
  | 'RAZORPAY_API_URL'
  | 'RAZORPAY_PLAN_PRO_MONTHLY'
  | 'RAZORPAY_PLAN_PRO_YEARLY'
  | 'RAZORPAY_PLAN_BUSINESS_MONTHLY'
  | 'RAZORPAY_PLAN_BUSINESS_YEARLY'
>;

function toSummary(subscription: {
  razorpaySubscriptionId: string;
  plan: $Enums.Plan;
  interval: $Enums.BillingInterval;
  status: $Enums.SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}): SubscriptionSummary {
  return {
    id: subscription.razorpaySubscriptionId,
    plan: subscription.plan,
    interval: INTERVAL[subscription.interval],
    status: subscription.status.toLowerCase() as SubscriptionSummary['status'],
    currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
}

/** Razorpay's failures, as the client sees them: nothing was charged. */
function providerError(error: unknown): never {
  if (
    error instanceof RazorpayError ||
    error instanceof TypeError ||
    (error as Error).name === 'TimeoutError'
  ) {
    throw new AppError(
      502,
      'PAYMENT_PROVIDER_ERROR',
      'Razorpay could not be reached. Nothing was charged; try again in a moment.',
      { cause: error },
    );
  }
  throw error;
}

export interface BillingService {
  summary(workspaceId: string): Promise<BillingSummary>;
  /** Starts a subscription and returns what Checkout opens with. */
  subscribe(workspaceId: string, userId: string, input: SubscribeInput): Promise<Checkout>;
  /** Checks Checkout's signature; the webhook still decides the plan. */
  verify(
    workspaceId: string,
    userId: string,
    input: VerifyCheckoutInput,
  ): Promise<VerifyCheckoutResponse & { plan: PaidPlan; interval: BillingInterval }>;
  cancel(workspaceId: string, input: CancelInput): Promise<BillingSummary>;
  /**
   * Cancels every running subscription at once, before the workspace is deleted. Throws
   * (keeping the workspace) if one can't be cancelled; does nothing without one.
   */
  endForDeletion(workspaceId: string): Promise<void>;
  /**
   * Lets a running plan that `payerId` started end with its paid period instead of renewing
   * (they are leaving). Does nothing for another person's plan, or none; throws if Razorpay
   * can't be reached.
   */
  stopRenewing(workspaceId: string, payerId: string): Promise<void>;
  /** Whether the workspace has a plan running (paid for, or about to be). */
  hasRunningPlan(workspaceId: string): Promise<boolean>;
  /** Keeps a plan that is set to end: a new subscription that starts when the current one ends. */
  resume(workspaceId: string, userId: string): Promise<Checkout>;
  changePlan(workspaceId: string, input: SubscribeInput): Promise<BillingSummary>;
  payments(workspaceId: string): Promise<PaymentsResponse>;
  /** Hides "what changed" after a downgrade. */
  dismissDowngrade(workspaceId: string): Promise<void>;
}

export function createBillingService({
  prisma,
  env,
  razorpay,
  now = () => new Date(),
}: {
  prisma: Database;
  env: BillingEnv;
  razorpay: RazorpayClient;
  now?: () => Date;
}): BillingService {
  function assertConfigured() {
    if (!billingConfigured(env)) {
      throw new AppError(503, 'BILLING_UNAVAILABLE', 'Payments are not set up on this server.');
    }
  }

  const runningSubscription = (workspaceId: string) =>
    prisma.subscription.findFirst({
      where: { workspaceId, status: { in: RUNNING } },
      orderBy: { createdAt: 'desc' },
    });

  async function checkout(
    workspaceId: string,
    userId: string,
    { plan, interval }: { plan: PaidPlan; interval: BillingInterval },
    startAt: Date | null,
  ): Promise<Checkout> {
    assertConfigured();
    const planId = razorpayPlanIds(env)[plan][interval];
    if (!planId) throw new AppError(503, 'BILLING_UNAVAILABLE', 'This plan can’t be bought yet.');
    const [user, workspace] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } }),
      prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { razorpayCustomerId: true },
      }),
    ]);

    let customerId = workspace.razorpayCustomerId;
    let razorpaySubscriptionId: string;
    try {
      if (!customerId) {
        customerId = (
          await razorpay.createCustomer({ name: user.name, email: user.email, workspaceId })
        ).id;
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: { razorpayCustomerId: customerId },
        });
      }
      razorpaySubscriptionId = (
        await razorpay.createSubscription({
          planId,
          totalCount: TOTAL_COUNT[interval],
          customerId,
          workspaceId,
          ...(startAt && { startAt: Math.floor(startAt.getTime() / 1000) }),
        })
      ).id;
    } catch (error) {
      providerError(error);
    }

    await prisma.subscription.create({
      data: {
        workspaceId,
        razorpaySubscriptionId,
        razorpayCustomerId: customerId,
        plan,
        interval: STORED_INTERVAL[interval],
        createdById: userId,
      },
    });
    return {
      subscriptionId: razorpaySubscriptionId,
      keyId: env.RAZORPAY_KEY_ID ?? '',
      plan,
      interval,
      amount: PRICES[plan][interval],
      currency: 'INR',
      prefill: { name: user.name, email: user.email },
    };
  }

  const service: BillingService = {
    async summary(workspaceId) {
      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { ...WORKSPACE_BILLING_SELECT, downgradedFrom: true, downgradedAt: true },
      });
      const entitlements = resolveEntitlements(workspace, env.ENTITLEMENTS_MODE, now());
      // The latest subscription someone finished checking out (a checkout left open is not one).
      const subscription = await prisma.subscription.findFirst({
        where: { workspaceId, status: { not: 'CREATED' } },
        orderBy: { createdAt: 'desc' },
      });
      const { downgradedFrom, downgradedAt } = workspace;
      const stillDown =
        downgradedFrom && downgradedAt && !planIncludes(entitlements.effectivePlan, downgradedFrom);
      return {
        plan: entitlements.plan,
        effectivePlan: entitlements.effectivePlan,
        planStatus: entitlements.planStatus,
        trialEndsAt: entitlements.trialEndsAt,
        graceEndsAt: entitlements.graceEndsAt,
        complimentaryPlan: entitlements.complimentaryPlan,
        complimentaryUntil: entitlements.complimentaryUntil,
        subscription: subscription ? toSummary(subscription) : null,
        usage: await workspaceUsage(prisma, workspaceId, entitlements, now()),
        downgrade: stillDown
          ? {
              from: downgradedFrom,
              at: downgradedAt.toISOString(),
              forms: await downgradedForms(prisma, workspaceId, entitlements.features),
            }
          : null,
        enforcement: env.ENFORCEMENT_MODE,
        checkoutAvailable: billingConfigured(env),
      };
    },

    async subscribe(workspaceId, userId, input) {
      assertConfigured();
      const running = await runningSubscription(workspaceId);
      if (running && !running.cancelAtPeriodEnd) {
        throw new AppError(
          409,
          'CONFLICT',
          `This workspace already has ${PLAN_LABELS[running.plan]}. Change the plan instead.`,
        );
      }
      if (running) {
        throw new AppError(409, 'CONFLICT', 'Your plan is set to end: resume it instead.');
      }
      // Bought during a trial, the plan starts (and is first charged) when the trial ends.
      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { planStatus: true, trialEndsAt: true },
      });
      const trialLeft =
        workspace.planStatus === 'TRIALING' && workspace.trialEndsAt
          ? workspace.trialEndsAt.getTime() - now().getTime()
          : 0;
      return checkout(
        workspaceId,
        userId,
        input,
        trialLeft > MIN_DEFERRED_START_MS ? workspace.trialEndsAt : null,
      );
    },

    async verify(workspaceId, _userId, input) {
      assertConfigured();
      const valid = checkoutSignatureValid(env.RAZORPAY_KEY_SECRET ?? '', {
        paymentId: input.razorpayPaymentId,
        subscriptionId: input.razorpaySubscriptionId,
        signature: input.razorpaySignature,
      });
      if (!valid) {
        throw new AppError(400, 'INVALID_SIGNATURE', 'This payment could not be confirmed.');
      }
      const subscription = await prisma.subscription.findFirst({
        where: { workspaceId, razorpaySubscriptionId: input.razorpaySubscriptionId },
      });
      if (!subscription) throw new AppError(404, 'NOT_FOUND', 'Subscription not found');
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { verifiedAt: now() },
      });
      // Fallback: activate the plan immediately. The webhook will confirm/idempotently update.
      // If the first charge later fails, the payment.failed/pending/halted webhooks will revert.
      await activatePlan(prisma, workspaceId, subscription.plan);
      return {
        status: ['ACTIVE', 'AUTHENTICATED'].includes(subscription.status) ? 'active' : 'confirming',
        plan: subscription.plan as PaidPlan,
        interval: INTERVAL[subscription.interval],
      };
    },

    async endForDeletion(workspaceId) {
      const running = await prisma.subscription.findMany({
        where: { workspaceId, status: { in: RUNNING } },
        select: { id: true, razorpaySubscriptionId: true },
      });
      if (running.length === 0) return;
      if (!billingConfigured(env)) {
        throw new AppError(
          503,
          'BILLING_UNAVAILABLE',
          'This workspace’s plan can’t be cancelled right now, so it was kept. Try again later.',
        );
      }
      for (const subscription of running) {
        try {
          // At once, not at the period's end: the workspace is about to go.
          await razorpay.cancelSubscription(subscription.razorpaySubscriptionId, false);
        } catch (error) {
          providerError(error);
        }
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'CANCELLED', cancelReason: 'Workspace deleted' },
        });
      }
    },

    async stopRenewing(workspaceId, payerId) {
      const running = await runningSubscription(workspaceId);
      if (!running || running.cancelAtPeriodEnd || running.createdById !== payerId) return;
      if (!billingConfigured(env)) {
        throw new AppError(503, 'BILLING_UNAVAILABLE', 'Payments are not set up on this server.');
      }
      const atPeriodEnd = running.status === 'ACTIVE';
      try {
        await razorpay.cancelSubscription(running.razorpaySubscriptionId, atPeriodEnd);
      } catch (error) {
        providerError(error);
      }
      await prisma.subscription.update({
        where: { id: running.id },
        data: { cancelAtPeriodEnd: atPeriodEnd, cancelReason: 'Owner deleted their account' },
      });
    },

    async hasRunningPlan(workspaceId) {
      return (await runningSubscription(workspaceId)) !== null;
    },

    async cancel(workspaceId, input) {
      assertConfigured();
      const running = await runningSubscription(workspaceId);
      if (!running) throw new AppError(404, 'NOT_FOUND', 'There is no plan to cancel.');
      // Not started yet, or not paid for: it ends now. A paid period runs to its end.
      const atPeriodEnd = running.status === 'ACTIVE';
      try {
        await razorpay.cancelSubscription(running.razorpaySubscriptionId, atPeriodEnd);
      } catch (error) {
        providerError(error);
      }
      const reason = [input.reason, input.details].filter(Boolean).join(': ');
      await prisma.subscription.update({
        where: { id: running.id },
        data: { cancelAtPeriodEnd: atPeriodEnd, ...(reason && { cancelReason: reason }) },
      });
      return service.summary(workspaceId);
    },

    async resume(workspaceId, userId) {
      const running = await runningSubscription(workspaceId);
      if (!running?.cancelAtPeriodEnd || !running.currentPeriodEnd) {
        throw new AppError(409, 'CONFLICT', 'There is no plan set to end.');
      }
      // Razorpay can't take back a cancellation, so the plan carries on as a new subscription
      // from the day the current one ends: nothing is charged twice.
      return checkout(
        workspaceId,
        userId,
        { plan: running.plan as PaidPlan, interval: INTERVAL[running.interval] },
        running.currentPeriodEnd,
      );
    },

    async changePlan(workspaceId, { plan, interval }) {
      assertConfigured();
      const running = await runningSubscription(workspaceId);
      if (running?.status !== 'ACTIVE' || running.cancelAtPeriodEnd) {
        throw new AppError(409, 'CONFLICT', 'Only a running plan can be changed.');
      }
      const current = { plan: running.plan, interval: INTERVAL[running.interval] };
      if (current.plan === plan && current.interval === interval) {
        throw new AppError(400, 'BAD_REQUEST', 'That is the plan you have.');
      }
      const planId = razorpayPlanIds(env)[plan][interval];
      if (!planId) throw new AppError(503, 'BILLING_UNAVAILABLE', 'This plan can’t be bought yet.');
      // More (a higher plan, or a year at once) starts now; less waits for the period's end.
      const more =
        planIncludes(plan, current.plan) && !(plan === current.plan && interval === 'monthly');
      try {
        const updated = await razorpay.updateSubscription(running.razorpaySubscriptionId, {
          planId,
          at: more ? 'now' : 'cycle_end',
        });
        const changed = planForRazorpayPlan(env, updated.plan_id);
        if (more && changed) {
          await prisma.subscription.update({
            where: { id: running.id },
            data: { plan: changed.plan, interval: STORED_INTERVAL[changed.interval] },
          });
          await activatePlan(prisma, workspaceId, changed.plan);
        }
      } catch (error) {
        providerError(error);
      }
      return service.summary(workspaceId);
    },

    async payments(workspaceId) {
      const payments = await prisma.payment.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return {
        payments: payments.map((payment) => ({
          id: payment.razorpayPaymentId,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status === 'PAID' ? 'paid' : 'failed',
          paidAt: payment.paidAt?.toISOString() ?? null,
          createdAt: payment.createdAt.toISOString(),
          invoiceUrl: payment.invoiceUrl,
          failureReason: payment.failureReason,
        })),
      };
    },

    async dismissDowngrade(workspaceId) {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { downgradedFrom: null, downgradedAt: null },
      });
    },
  };
  return service;
}
