import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PRICES } from '@formyx/shared';
import type { RazorpayPayment, RazorpaySubscription } from '../billing/razorpay.js';
import { signForTests } from '../billing/razorpay.js';

/*
 * The Razorpay API calls billing makes (customers, plans, subscriptions, invoices), in memory
 * on 127.0.0.1, for tests; and webhooks signed as Razorpay signs them. Point RAZORPAY_API_URL
 * at `url` and pass `env` to the app.
 */

export const FAKE_RAZORPAY_KEY_ID = 'rzp_test_fake';
export const FAKE_RAZORPAY_KEY_SECRET = 'fake_key_secret';
export const FAKE_RAZORPAY_WEBHOOK_SECRET = 'fake_webhook_secret';

export const FAKE_PLAN_IDS = {
  RAZORPAY_PLAN_PRO_MONTHLY: 'plan_promonthly',
  RAZORPAY_PLAN_PRO_YEARLY: 'plan_proyearly',
  RAZORPAY_PLAN_BUSINESS_MONTHLY: 'plan_businessmonthly',
  RAZORPAY_PLAN_BUSINESS_YEARLY: 'plan_businessyearly',
} as const;

interface FakePlan {
  id: string;
  period: string;
  interval: number;
  item: { amount: number; currency: string; name: string };
}

interface FakeSubscription extends RazorpaySubscription {
  start_at?: number;
  total_count: number;
  /** A plan change waiting for the end of the period. */
  scheduled_plan_id?: string;
  cancel_at_cycle_end?: boolean;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

export async function startFakeRazorpay() {
  const plans = new Map<string, FakePlan>([
    ['plan_promonthly', plan('plan_promonthly', 'monthly', PRICES.PRO.monthly)],
    ['plan_proyearly', plan('plan_proyearly', 'yearly', PRICES.PRO.yearly)],
    ['plan_businessmonthly', plan('plan_businessmonthly', 'monthly', PRICES.BUSINESS.monthly)],
    ['plan_businessyearly', plan('plan_businessyearly', 'yearly', PRICES.BUSINESS.yearly)],
  ]);
  const customers = new Map<string, { id: string; email: string }>();
  const subscriptions = new Map<string, FakeSubscription>();
  const invoices = new Map<
    string,
    { id: string; subscription_id: string; payment_id: string; short_url: string }
  >();
  /** Statuses to answer with instead, once each, for the next requests. */
  const failures: number[] = [];
  const requests: { method: string; path: string; body: Record<string, unknown> }[] = [];
  let next = 1;
  const id = (prefix: string) => `${prefix}_fake${String(next++)}`;

  function plan(planId: string, period: string, amount: number): FakePlan {
    return { id: planId, period, interval: 1, item: { amount, currency: 'INR', name: planId } };
  }

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  const badRequest = (res: ServerResponse, description: string) => {
    send(res, 400, { error: { code: 'BAD_REQUEST_ERROR', description } });
  };

  const server = createServer((req, res) => {
    void (async () => {
      const expected = `Basic ${Buffer.from(`${FAKE_RAZORPAY_KEY_ID}:${FAKE_RAZORPAY_KEY_SECRET}`).toString('base64')}`;
      if (req.headers.authorization !== expected) {
        send(res, 401, {
          error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' },
        });
        return;
      }
      const url = new URL(req.url ?? '/', 'http://localhost');
      const method = req.method ?? 'GET';
      const body = method === 'GET' ? {} : await readBody(req);
      requests.push({ method, path: url.pathname, body });
      const failure = failures.shift();
      if (failure) {
        send(res, failure, {
          error: { code: 'SERVER_ERROR', description: 'Something went wrong' },
        });
        return;
      }
      const parts = url.pathname.split('/').filter(Boolean); // ['v1', 'subscriptions', id, ...]

      if (method === 'POST' && url.pathname === '/v1/customers') {
        const email = String(body.email);
        const existing = [...customers.values()].find((customer) => customer.email === email);
        const customer = existing ?? { id: id('cust'), email };
        customers.set(customer.id, customer);
        send(res, 200, { ...customer, entity: 'customer' });
        return;
      }
      if (method === 'POST' && url.pathname === '/v1/plans') {
        const item = body.item as { amount: number; currency: string; name: string };
        const made = plan(id('plan'), String(body.period), item.amount);
        plans.set(made.id, made);
        send(res, 200, made);
        return;
      }
      if (method === 'GET' && parts[1] === 'plans' && parts[2]) {
        const found = plans.get(parts[2]);
        if (found) send(res, 200, found);
        else badRequest(res, 'The id provided does not exist');
        return;
      }
      if (method === 'POST' && url.pathname === '/v1/subscriptions') {
        const planId = String(body.plan_id);
        if (!plans.has(planId)) {
          badRequest(res, 'The id provided does not exist');
          return;
        }
        const subscription: FakeSubscription = {
          id: id('sub'),
          plan_id: planId,
          customer_id: (body.customer_id as string | undefined) ?? null,
          status: 'created',
          total_count: Number(body.total_count),
          notes: body.notes as Record<string, string>,
          ...(typeof body.start_at === 'number' && { start_at: body.start_at }),
        };
        subscriptions.set(subscription.id, subscription);
        send(res, 200, subscription);
        return;
      }
      if (parts[1] === 'subscriptions' && parts[2]) {
        const subscription = subscriptions.get(parts[2]);
        if (!subscription) {
          badRequest(res, 'The id provided does not exist');
          return;
        }
        if (method === 'GET' && parts.length === 3) {
          send(res, 200, subscription);
          return;
        }
        if (method === 'POST' && parts[3] === 'cancel') {
          if (body.cancel_at_cycle_end === 1) subscription.cancel_at_cycle_end = true;
          else subscription.status = 'cancelled';
          send(res, 200, subscription);
          return;
        }
        if (method === 'POST' && (parts[3] === 'pause' || parts[3] === 'resume')) {
          if (parts[3] === 'pause' && subscription.status !== 'active') {
            badRequest(res, 'Only an active subscription can be paused');
            return;
          }
          subscription.status = parts[3] === 'pause' ? 'paused' : 'active';
          send(res, 200, subscription);
          return;
        }
        if (method === 'PATCH' && parts.length === 3) {
          const planId = String(body.plan_id);
          if (!plans.has(planId)) {
            badRequest(res, 'The id provided does not exist');
            return;
          }
          if (body.schedule_change_at === 'now') subscription.plan_id = planId;
          else subscription.scheduled_plan_id = planId;
          send(res, 200, subscription);
          return;
        }
      }
      if (method === 'GET' && parts[1] === 'invoices' && parts[2]) {
        const invoice = invoices.get(parts[2]);
        if (invoice) send(res, 200, invoice);
        else badRequest(res, 'The id provided does not exist');
        return;
      }
      send(res, 404, { error: { code: 'BAD_REQUEST_ERROR', description: 'No such endpoint' } });
    })().catch((error: unknown) => {
      send(res, 500, { error: { description: String(error) } });
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  return {
    url,
    /** What to add to the test app's settings. */
    env: {
      RAZORPAY_KEY_ID: FAKE_RAZORPAY_KEY_ID,
      RAZORPAY_KEY_SECRET: FAKE_RAZORPAY_KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET: FAKE_RAZORPAY_WEBHOOK_SECRET,
      RAZORPAY_API_URL: url,
      ...FAKE_PLAN_IDS,
    } as Record<string, string>,
    plans,
    customers,
    subscriptions,
    invoices,
    requests,
    /** The next requests answer with these statuses instead. */
    fail: (...statuses: number[]) => failures.push(...statuses),
    /** An invoice for a payment, as Razorpay makes one for each charge. */
    invoice(subscriptionId: string, paymentId: string) {
      const invoice = {
        id: id('inv'),
        subscription_id: subscriptionId,
        payment_id: paymentId,
        short_url: `https://rzp.io/i/${paymentId}`,
      };
      invoices.set(invoice.id, invoice);
      return invoice;
    },
    reset() {
      customers.clear();
      subscriptions.clear();
      invoices.clear();
      failures.length = 0;
      requests.length = 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

export type FakeRazorpay = Awaited<ReturnType<typeof startFakeRazorpay>>;

/** Checkout's signature for a payment of `subscriptionId`, as Razorpay makes it. */
export function checkoutSignature(paymentId: string, subscriptionId: string): string {
  return signForTests(FAKE_RAZORPAY_KEY_SECRET, `${paymentId}|${subscriptionId}`);
}

let eventCount = 0;

/** A webhook body as Razorpay sends it. */
export function webhookBody(
  event: string,
  entities: { subscription?: RazorpaySubscription; payment?: RazorpayPayment },
  createdAt: Date = new Date(),
) {
  return {
    entity: 'event',
    account_id: 'acc_fake',
    event,
    contains: Object.keys(entities),
    payload: Object.fromEntries(
      Object.entries(entities).map(([name, entity]) => [name, { entity }]),
    ),
    created_at: Math.floor(createdAt.getTime() / 1000),
  };
}

/** The headers Razorpay sends with `body`: its signature and a fresh event id. */
export function webhookHeaders(
  body: string,
  { eventId = `evt_fake${String(++eventCount)}`, secret = FAKE_RAZORPAY_WEBHOOK_SECRET } = {},
) {
  return {
    'Content-Type': 'application/json',
    'X-Razorpay-Signature': signForTests(secret, body),
    'X-Razorpay-Event-Id': eventId,
  };
}

/** Unix seconds. */
export const unix = (date: Date) => Math.floor(date.getTime() / 1000);
