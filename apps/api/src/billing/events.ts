import type { Logger } from 'pino';
import type { $Enums } from '../generated/prisma/client.js';
import { renderPaymentFailedEmail, renderPlanEndedEmail } from '../notifications/billing-email.js';
import { sendBillingNotice, type NoticeDependencies } from './notices.js';
import { activatePlan, downgradeToFree, markPastDue } from './plan-changes.js';
import {
  planForRazorpayPlan,
  type RazorpayClient,
  type RazorpayEnv,
  type RazorpayPayment,
  type RazorpaySubscription,
} from './razorpay.js';

/*
 * Applies a Razorpay webhook event, stored in razorpay_events, to billing. Webhooks are the
 * source of truth for subscriptions and payments; each one is applied once, and every step is
 * safe to repeat if the job is retried. Razorpay may deliver events out of order, so a
 * subscription's status only moves on to an event newer than the last one applied.
 */

/** The events billing acts on; others are stored and marked processed. */
export const HANDLED_EVENTS = [
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.pending',
  'subscription.halted',
  'subscription.cancelled',
  'subscription.completed',
  'payment.failed',
] as const;

export interface RazorpayWebhookBody {
  event: string;
  /** Unix seconds. */
  created_at: number;
  payload: {
    subscription?: { entity: RazorpaySubscription };
    payment?: { entity: RazorpayPayment };
  };
}

export interface EventDependencies extends NoticeDependencies {
  env: NoticeDependencies['env'] & RazorpayEnv;
  razorpay: RazorpayClient;
  logger: Logger;
  now?: () => Date;
}

type SubscriptionStatus = $Enums.SubscriptionStatus;
const STATUSES = new Set<string>([
  'CREATED',
  'AUTHENTICATED',
  'ACTIVE',
  'PENDING',
  'HALTED',
  'CANCELLED',
  'COMPLETED',
  'EXPIRED',
  'PAUSED',
]);

function toStatus(razorpayStatus: string): SubscriptionStatus | null {
  const upper = razorpayStatus.toUpperCase();
  return STATUSES.has(upper) ? (upper as SubscriptionStatus) : null;
}

const fromUnix = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000) : null;

/** Statuses after which a subscription never charges again. */
const ENDED: readonly SubscriptionStatus[] = ['CANCELLED', 'COMPLETED', 'EXPIRED'];

/** Applies the stored event `eventId`, once. Throws (and records why) for the job to retry. */
export async function processRazorpayEvent(
  deps: EventDependencies,
  eventId: string,
): Promise<void> {
  const { prisma, logger } = deps;
  const stored = await prisma.razorpayEvent.findUnique({ where: { id: eventId } });
  if (!stored) {
    logger.warn({ eventId }, 'Razorpay event not found');
    return;
  }
  if (stored.processedAt) return;
  try {
    await applyEvent(deps, stored.payload as unknown as RazorpayWebhookBody);
    await prisma.razorpayEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date(), error: null },
    });
    logger.info({ eventId, type: stored.type }, 'Razorpay event applied');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.razorpayEvent.update({
      where: { id: eventId },
      data: { error: message.slice(0, 500) },
    });
    logger.error({ err: error, eventId, type: stored.type }, 'Razorpay event failed');
    throw error;
  }
}

async function applyEvent(deps: EventDependencies, body: RazorpayWebhookBody): Promise<void> {
  const eventAt = fromUnix(body.created_at) ?? new Date();
  const subscription = body.payload.subscription?.entity;
  const payment = body.payload.payment?.entity;

  if (subscription) {
    const stored = await updateSubscription(deps, subscription, eventAt);
    if (stored && payment && body.event === 'subscription.charged') {
      await recordPayment(deps, stored, payment, 'PAID');
    }
    return;
  }
  if (payment && body.event === 'payment.failed') {
    await paymentFailed(deps, payment, eventAt);
  }
}

interface StoredSubscription {
  id: string;
  workspaceId: string;
  plan: $Enums.Plan;
  status: SubscriptionStatus;
}

/**
 * Brings our copy of a subscription up to date, then the workspace's plan with it. Returns
 * the stored subscription, or null for one that isn't ours (made elsewhere in the account).
 */
async function updateSubscription(
  deps: EventDependencies,
  entity: RazorpaySubscription,
  eventAt: Date,
): Promise<StoredSubscription | null> {
  const { prisma, logger } = deps;
  const existing = await prisma.subscription.findUnique({
    where: { razorpaySubscriptionId: entity.id },
  });
  if (!existing) {
    logger.warn(
      { subscription: entity.id },
      'Razorpay event for a subscription Formyx did not make',
    );
    return null;
  }
  const status = toStatus(entity.status);
  const known = planForRazorpayPlan(deps.env, entity.plan_id);
  // An older event arriving late must not undo a newer one; its payment still counts.
  const stale = existing.lastEventAt !== null && eventAt < existing.lastEventAt;
  if (stale || !status) return existing;

  const updated = await prisma.subscription.update({
    where: { id: existing.id },
    data: {
      status,
      lastEventAt: eventAt,
      ...(entity.customer_id ? { razorpayCustomerId: entity.customer_id } : {}),
      ...(known
        ? { plan: known.plan, interval: known.interval === 'monthly' ? 'MONTHLY' : 'YEARLY' }
        : {}),
      ...(entity.current_start ? { currentPeriodStart: fromUnix(entity.current_start) } : {}),
      ...(entity.current_end ? { currentPeriodEnd: fromUnix(entity.current_end) } : {}),
    },
  });
  await updateWorkspacePlan(deps, updated, existing.status, eventAt);
  return updated;
}

/**
 * Whether `subscription` is the one that decides the workspace's plan: no later subscription
 * of the workspace is in use or on its way (a resumed plan starts as a new one).
 */
async function isCurrent(
  deps: EventDependencies,
  subscription: { id: string; workspaceId: string; createdAt: Date },
) {
  const newer = await deps.prisma.subscription.count({
    where: {
      workspaceId: subscription.workspaceId,
      id: { not: subscription.id },
      createdAt: { gt: subscription.createdAt },
      status: { in: ['AUTHENTICATED', 'ACTIVE', 'PENDING', 'HALTED'] },
    },
  });
  return newer === 0;
}

async function updateWorkspacePlan(
  deps: EventDependencies,
  subscription: StoredSubscription & {
    createdAt: Date;
    currentPeriodStart: Date | null;
  },
  previous: SubscriptionStatus,
  eventAt: Date,
): Promise<void> {
  const { prisma } = deps;
  const now = deps.now?.() ?? new Date();
  if (!(await isCurrent(deps, subscription))) return;
  const { workspaceId } = subscription;

  switch (subscription.status) {
    case 'ACTIVE':
      await activatePlan(prisma, workspaceId, subscription.plan);
      return;
    case 'PENDING': {
      const graceEndsAt = await markPastDue(prisma, workspaceId, eventAt);
      await notifyPaymentFailed(deps, subscription, graceEndsAt);
      return;
    }
    case 'HALTED': {
      // Every retry failed: Free once the grace period is over (the hourly job checks too).
      const graceEndsAt = await markPastDue(prisma, workspaceId, eventAt);
      if (graceEndsAt <= now) await endPlan(deps, workspaceId, 'unpaid', now);
      return;
    }
    case 'CANCELLED':
    case 'COMPLETED':
    case 'EXPIRED': {
      // Only a plan that was paid for ends; a checkout given up on changes nothing.
      const wasPaid =
        subscription.currentPeriodStart !== null ||
        !['CREATED', 'AUTHENTICATED'].includes(previous);
      if (wasPaid && !ENDED.includes(previous)) await endPlan(deps, workspaceId, 'cancelled', now);
      return;
    }
    default:
      return;
  }
}

/** Moves the workspace to Free and tells its owners, once. */
export async function endPlan(
  deps: NoticeDependencies,
  workspaceId: string,
  reason: 'cancelled' | 'unpaid' | 'complimentary' | 'trial',
  now: Date,
): Promise<void> {
  const from = await downgradeToFree(deps.prisma, workspaceId, now);
  if (!from || reason === 'trial') return;
  await sendBillingNotice(deps, {
    workspaceId,
    kind: `plan_ended_${reason}`,
    periodKey: now.toISOString(),
    render: (context) => renderPlanEndedEmail(context, { plan: from, reason }),
  });
}

async function notifyPaymentFailed(
  deps: EventDependencies,
  subscription: StoredSubscription & { currentPeriodStart: Date | null },
  graceEndsAt: Date,
) {
  await sendBillingNotice(deps, {
    workspaceId: subscription.workspaceId,
    kind: 'payment_failed',
    // Once per grace period.
    periodKey: graceEndsAt.toISOString(),
    render: (context) =>
      renderPaymentFailedEmail(context, { plan: subscription.plan, graceEndsAt }),
  });
}

/** Keeps a payment (paid or failed) for the payment history, with its invoice's link. */
async function recordPayment(
  deps: EventDependencies,
  subscription: StoredSubscription,
  payment: RazorpayPayment,
  status: 'PAID' | 'FAILED',
): Promise<void> {
  let invoiceUrl: string | null = null;
  if (payment.invoice_id && status === 'PAID') {
    try {
      invoiceUrl = (await deps.razorpay.fetchInvoice(payment.invoice_id)).short_url ?? null;
    } catch (error) {
      // The payment matters more than its link; it can be looked up in Razorpay.
      deps.logger.warn({ err: error, invoice: payment.invoice_id }, 'Could not fetch the invoice');
    }
  }
  const data = {
    workspaceId: subscription.workspaceId,
    subscriptionId: subscription.id,
    amount: payment.amount,
    currency: payment.currency,
    status,
    invoiceId: payment.invoice_id ?? null,
    failureReason: status === 'FAILED' ? (payment.error_description ?? 'The payment failed') : null,
    paidAt: status === 'PAID' ? fromUnix(payment.created_at) : null,
  } as const;
  await deps.prisma.payment.upsert({
    where: { razorpayPaymentId: payment.id },
    create: { razorpayPaymentId: payment.id, ...data, invoiceUrl },
    // A failure later followed by success for the same payment id: the latest word wins.
    update: { ...data, ...(invoiceUrl ? { invoiceUrl } : {}) },
  });
}

/** The subscription a payment was for: named on it, through its invoice, or not found. */
async function subscriptionForPayment(deps: EventDependencies, payment: RazorpayPayment) {
  let razorpaySubscriptionId = payment.subscription_id ?? null;
  if (!razorpaySubscriptionId && payment.invoice_id) {
    razorpaySubscriptionId =
      (await deps.razorpay.fetchInvoice(payment.invoice_id)).subscription_id ?? null;
  }
  if (!razorpaySubscriptionId) return null;
  return deps.prisma.subscription.findUnique({ where: { razorpaySubscriptionId } });
}

/**
 * A charge failed. At checkout that changes nothing (the person sees it and can try again);
 * for a subscription already running it is a failed renewal, and the grace period starts.
 */
async function paymentFailed(deps: EventDependencies, payment: RazorpayPayment, failedAt: Date) {
  const subscription = await subscriptionForPayment(deps, payment);
  if (!subscription) {
    deps.logger.info({ payment: payment.id }, 'A failed payment for no subscription of ours');
    return;
  }
  await recordPayment(deps, subscription, payment, 'FAILED');
  if (!['ACTIVE', 'PENDING'].includes(subscription.status)) return;
  if (!(await isCurrent(deps, subscription))) return;
  const graceEndsAt = await markPastDue(deps.prisma, subscription.workspaceId, failedAt);
  await notifyPaymentFailed(deps, subscription, graceEndsAt);
}
