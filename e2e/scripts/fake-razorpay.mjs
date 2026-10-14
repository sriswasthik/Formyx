// A stand-in for Razorpay, for end-to-end tests: the API calls billing makes (customers, plans,
// subscriptions, invoices) under /razorpay/v1 (the API's RAZORPAY_API_URL points at /razorpay),
// and Checkout's script at /razorpay/checkout.js (the web app's VITE_RAZORPAY_CHECKOUT_URL),
// whose window pays at once and signs the payment as Razorpay would. Tests read a customer's
// latest subscription at GET /razorpay/__last?email=…, then send the webhooks themselves.
import { createHmac } from 'node:crypto';
// The keys and plan ids, shared with playwright.config.ts.
import E2E_RAZORPAY from './razorpay-e2e.json' with { type: 'json' };

const plans = new Map(
  Object.values(E2E_RAZORPAY.plans).map(({ id, period, amount }) => [
    id,
    { id, period, interval: 1, item: { amount, currency: 'INR', name: id } },
  ]),
);
const customers = new Map();
const subscriptions = new Map();
const invoices = new Map();
let next = 1;
// Ids stay unique across runs, as Razorpay's are: the database keeps the earlier ones.
const RUN = Date.now().toString(36);
const newId = (prefix) => `${prefix}_e2e${RUN}${String(next++)}`;

const sign = (message) =>
  createHmac('sha256', E2E_RAZORPAY.keySecret).update(message).digest('hex');

/** Checkout: a small window with Pay and Close, standing in for Razorpay's. */
const CHECKOUT_JS = `(() => {
  const origin = new URL(document.currentScript.src).origin;
  window.Razorpay = class {
    constructor(options) { this.options = options; }
    open() {
      const { options } = this;
      const dialog = document.createElement('dialog');
      dialog.setAttribute('aria-label', 'Razorpay test checkout');
      dialog.innerHTML = '<p>Razorpay test checkout: ' + options.description + '</p>' +
        '<button type="button" data-pay>Pay with test card</button> ' +
        '<button type="button" data-close>Close</button>';
      document.body.append(dialog);
      dialog.showModal();
      dialog.querySelector('[data-close]').addEventListener('click', () => {
        dialog.remove();
        options.modal.ondismiss();
      });
      dialog.querySelector('[data-pay]').addEventListener('click', async () => {
        const answer = await fetch(origin + '/razorpay/__pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription_id: options.subscription_id }),
        }).then((response) => response.json());
        dialog.remove();
        options.handler(answer);
      });
    }
  };
})();`;

/** Answers a request under /razorpay; `parts` are the path's parts after "razorpay". */
export async function handleRazorpay(req, res, url, parts, send, readBody) {
  if (req.method === 'GET' && parts[0] === 'checkout.js') {
    send(res, 200, CHECKOUT_JS, { 'Content-Type': 'text/javascript' });
    return;
  }
  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }
  if (req.method === 'POST' && parts[0] === '__pay') {
    const { subscription_id: subscriptionId } = JSON.parse((await readBody(req)).toString());
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription) return send(res, 404, { error: 'No such subscription' });
    subscription.status = 'authenticated';
    const paymentId = newId('pay');
    subscription.lastPaymentId = paymentId;
    send(res, 200, {
      razorpay_payment_id: paymentId,
      razorpay_subscription_id: subscriptionId,
      razorpay_signature: sign(`${paymentId}|${subscriptionId}`),
    });
    return;
  }
  if (req.method === 'GET' && parts[0] === '__last') {
    const email = url.searchParams.get('email');
    const theirs = [...subscriptions.values()].filter(
      (subscription) => customers.get(subscription.customer_id)?.email === email,
    );
    const latest = theirs.at(-1);
    return latest ? send(res, 200, latest) : send(res, 404, { error: 'None yet' });
  }

  const expected = `Basic ${Buffer.from(`${E2E_RAZORPAY.keyId}:${E2E_RAZORPAY.keySecret}`).toString('base64')}`;
  if (req.headers.authorization !== expected) {
    return send(res, 401, { error: { description: 'Authentication failed' } });
  }
  const body = req.method === 'GET' ? {} : JSON.parse((await readBody(req)).toString() || '{}');
  const [, resource, id, action] = parts; // ['v1', 'subscriptions', id, 'cancel']
  const notFound = () =>
    send(res, 400, { error: { description: 'The id provided does not exist' } });

  if (req.method === 'POST' && resource === 'customers') {
    const existing = [...customers.values()].find((customer) => customer.email === body.email);
    const customer = existing ?? { id: newId('cust'), email: body.email };
    customers.set(customer.id, customer);
    return send(res, 200, customer);
  }
  if (req.method === 'GET' && resource === 'plans')
    return plans.has(id) ? send(res, 200, plans.get(id)) : notFound();
  if (req.method === 'POST' && resource === 'subscriptions' && !id) {
    if (!plans.has(body.plan_id)) return notFound();
    const subscription = {
      id: newId('sub'),
      plan_id: body.plan_id,
      customer_id: body.customer_id ?? null,
      status: 'created',
      total_count: body.total_count,
      notes: body.notes,
      ...(body.start_at && { start_at: body.start_at }),
    };
    subscriptions.set(subscription.id, subscription);
    return send(res, 200, subscription);
  }
  if (resource === 'subscriptions' && id) {
    const subscription = subscriptions.get(id);
    if (!subscription) return notFound();
    if (req.method === 'GET') return send(res, 200, subscription);
    if (req.method === 'POST' && action === 'cancel') {
      if (body.cancel_at_cycle_end === 1) subscription.cancel_at_cycle_end = true;
      else subscription.status = 'cancelled';
      return send(res, 200, subscription);
    }
    if (req.method === 'PATCH') {
      if (body.schedule_change_at === 'now') subscription.plan_id = body.plan_id;
      return send(res, 200, subscription);
    }
  }
  if (req.method === 'GET' && resource === 'invoices') {
    const invoice = invoices.get(id) ?? { id, short_url: `https://rzp.io/i/${id}` };
    invoices.set(id, invoice);
    return send(res, 200, invoice);
  }
  send(res, 404, { error: { description: 'No such endpoint' } });
}
