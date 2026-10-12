import { createHmac, timingSafeEqual } from 'node:crypto';
import { BILLING_INTERVALS, PAID_PLANS, type BillingInterval, type PaidPlan } from '@formyx/shared';
import type { Env } from '../config/env.js';

/*
 * Razorpay, over plain HTTPS (https://razorpay.com/docs/api/payments/subscriptions/):
 * customers, subscriptions, plans and invoices, and the two signatures Razorpay sends, one from
 * Checkout and one on each webhook. Amounts are in paise; times are Unix seconds.
 */

const REQUEST_TIMEOUT_MS = 20_000;

/** Billing cycles a subscription runs for before it completes: about ten years either way. */
export const TOTAL_COUNT: Record<BillingInterval, number> = { monthly: 120, yearly: 10 };

export type RazorpayEnv = Pick<
  Env,
  | 'RAZORPAY_KEY_ID'
  | 'RAZORPAY_KEY_SECRET'
  | 'RAZORPAY_WEBHOOK_SECRET'
  | 'RAZORPAY_API_URL'
  | 'RAZORPAY_PLAN_PRO_MONTHLY'
  | 'RAZORPAY_PLAN_PRO_YEARLY'
  | 'RAZORPAY_PLAN_BUSINESS_MONTHLY'
  | 'RAZORPAY_PLAN_BUSINESS_YEARLY'
>;

/** The Razorpay plan id for each plan and interval, from the environment. */
export function razorpayPlanIds(
  env: RazorpayEnv,
): Record<PaidPlan, Record<BillingInterval, string | undefined>> {
  return {
    PRO: { monthly: env.RAZORPAY_PLAN_PRO_MONTHLY, yearly: env.RAZORPAY_PLAN_PRO_YEARLY },
    BUSINESS: {
      monthly: env.RAZORPAY_PLAN_BUSINESS_MONTHLY,
      yearly: env.RAZORPAY_PLAN_BUSINESS_YEARLY,
    },
  };
}

/** Which of our plans a Razorpay plan id is, if it is one of ours. */
export function planForRazorpayPlan(
  env: RazorpayEnv,
  razorpayPlanId: string,
): { plan: PaidPlan; interval: BillingInterval } | null {
  const ids = razorpayPlanIds(env);
  for (const plan of PAID_PLANS) {
    for (const interval of BILLING_INTERVALS) {
      if (ids[plan][interval] === razorpayPlanId) return { plan, interval };
    }
  }
  return null;
}

/** Whether payments are set up: keys, the webhook secret and every plan id. */
export function billingConfigured(env: RazorpayEnv): boolean {
  const ids = razorpayPlanIds(env);
  return Boolean(
    env.RAZORPAY_KEY_ID &&
    env.RAZORPAY_KEY_SECRET &&
    env.RAZORPAY_WEBHOOK_SECRET &&
    PAID_PLANS.every((plan) => BILLING_INTERVALS.every((interval) => ids[plan][interval])),
  );
}

/** Compares two hex signatures in constant time. */
function sameSignature(expected: string, given: string): boolean {
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(given, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

const hmacHex = (secret: string, message: string | Buffer) =>
  createHmac('sha256', secret).update(message).digest('hex');

/**
 * Whether Checkout's signature is Razorpay's: HMAC-SHA256 of `payment_id|subscription_id` with
 * the key secret. It proves Checkout finished for this subscription, nothing more.
 */
export function checkoutSignatureValid(
  keySecret: string,
  input: { paymentId: string; subscriptionId: string; signature: string },
): boolean {
  return sameSignature(
    hmacHex(keySecret, `${input.paymentId}|${input.subscriptionId}`),
    input.signature,
  );
}

/** Whether a webhook's X-Razorpay-Signature is HMAC-SHA256 of its raw body with the webhook secret. */
export function webhookSignatureValid(secret: string, rawBody: Buffer, signature: string): boolean {
  return sameSignature(hmacHex(secret, rawBody), signature);
}

/** For tests and the fake Razorpay: signs as Razorpay does. */
export const signForTests = hmacHex;

export class RazorpayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'RazorpayError';
  }
}

export interface RazorpaySubscription {
  id: string;
  plan_id: string;
  customer_id?: string | null;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  ended_at?: number | null;
  notes?: Record<string, string> | unknown[];
}

export interface RazorpayPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  invoice_id?: string | null;
  customer_id?: string | null;
  /** Not documented on every payment; looked for, then the invoice is asked. */
  subscription_id?: string | null;
  error_description?: string | null;
  created_at: number;
}

export interface RazorpayPlan {
  id: string;
  period: string;
  interval: number;
  item: { amount: number; currency: string; name?: string };
}

export interface RazorpayInvoice {
  id: string;
  subscription_id?: string | null;
  payment_id?: string | null;
  short_url?: string | null;
}

export interface RazorpayClient {
  createCustomer(input: {
    name: string;
    email: string;
    workspaceId: string;
  }): Promise<{ id: string }>;
  createSubscription(input: {
    planId: string;
    totalCount: number;
    customerId: string;
    /** Unix seconds: when the first charge is due, for a subscription that starts later. */
    startAt?: number;
    workspaceId: string;
  }): Promise<RazorpaySubscription>;
  fetchSubscription(id: string): Promise<RazorpaySubscription>;
  /** Cancels now, or at the end of the current period. */
  cancelSubscription(id: string, atCycleEnd: boolean): Promise<RazorpaySubscription>;
  /** Moves to another plan, now or from the next period. */
  updateSubscription(
    id: string,
    input: { planId: string; at: 'now' | 'cycle_end' },
  ): Promise<RazorpaySubscription>;
  fetchPlan(id: string): Promise<RazorpayPlan>;
  /** Makes a plan: for setting up test mode (`billing:sync-plans --create`). */
  createPlan(input: {
    period: 'monthly' | 'yearly';
    amount: number;
    name: string;
    description: string;
  }): Promise<RazorpayPlan>;
  fetchInvoice(id: string): Promise<RazorpayInvoice>;
}

export function createRazorpayClient(env: RazorpayEnv): RazorpayClient {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID ?? ''}:${env.RAZORPAY_KEY_SECRET ?? ''}`);

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${env.RAZORPAY_API_URL}/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth.toString('base64')}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      let message = `Razorpay answered ${String(response.status)}`;
      try {
        const parsed = JSON.parse(text) as { error?: { description?: string } };
        if (parsed.error?.description) message = parsed.error.description;
      } catch {
        // Not JSON: keep the status.
      }
      throw new RazorpayError(response.status, message);
    }
    return JSON.parse(text) as T;
  }

  return {
    // fail_existing 0: an email Razorpay already knows gets its existing customer back.
    createCustomer: ({ name, email, workspaceId }) =>
      call('POST', '/customers', { name, email, fail_existing: '0', notes: { workspaceId } }),
    createSubscription: ({ planId, totalCount, customerId, startAt, workspaceId }) =>
      call('POST', '/subscriptions', {
        plan_id: planId,
        total_count: totalCount,
        quantity: 1,
        customer_notify: 1,
        customer_id: customerId,
        ...(startAt === undefined ? {} : { start_at: startAt }),
        notes: { workspaceId },
      }),
    fetchSubscription: (id) => call('GET', `/subscriptions/${encodeURIComponent(id)}`),
    cancelSubscription: (id, atCycleEnd) =>
      call('POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, {
        cancel_at_cycle_end: atCycleEnd ? 1 : 0,
      }),
    updateSubscription: (id, { planId, at }) =>
      call('PATCH', `/subscriptions/${encodeURIComponent(id)}`, {
        plan_id: planId,
        schedule_change_at: at,
        customer_notify: 1,
      }),
    fetchPlan: (id) => call('GET', `/plans/${encodeURIComponent(id)}`),
    createPlan: ({ period, amount, name, description }) =>
      call('POST', '/plans', {
        period,
        interval: 1,
        item: { name, amount, currency: 'INR', description },
      }),
    fetchInvoice: (id) => call('GET', `/invoices/${encodeURIComponent(id)}`),
  };
}
