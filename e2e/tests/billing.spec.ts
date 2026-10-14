import { createHmac } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import razorpay from '../scripts/razorpay-e2e.json' with { type: 'json' };
import { E2E_PASSWORD, uniqueEmail } from './helpers.js';

/*
 * Buying a plan, end to end. By default Razorpay is the fake in scripts/fake-razorpay.mjs: its
 * Checkout pays at once, and the test sends the webhooks Razorpay would, signed with the
 * webhook secret. With RAZORPAY_E2E=live (real test-mode keys in apps/api/.env), only the last
 * test runs: it opens Razorpay's own Checkout, where a person can pay with a test card.
 */

const live = process.env.RAZORPAY_E2E === 'live';
const fakeServices = `http://localhost:${process.env.E2E_FAKE_PORT ?? '4590'}`;
const DAY_S = 24 * 60 * 60;

test.use({ storageState: { cookies: [], origins: [] } });

/** A new account, signed in, on its own workspace's billing settings. */
async function newOwner(page: Page, name: string) {
  const email = uniqueEmail(name);
  const res = await page.request.post('/api/auth/register', {
    data: { name: 'Billing Tester', email, password: E2E_PASSWORD },
  });
  expect(res.ok(), await res.text()).toBe(true);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('formyx-signed-in', '1');
  });
  await page.goto('/app/settings/billing');
  return email;
}

/** Posts a webhook to the API as Razorpay would: signed over its exact body, with an event id. */
async function sendWebhook(page: Page, event: string, payload: Record<string, unknown>) {
  const body = JSON.stringify({
    entity: 'event',
    event,
    payload: Object.fromEntries(Object.entries(payload).map(([key, entity]) => [key, { entity }])),
    created_at: Math.floor(Date.now() / 1000),
  });
  const res = await page.request.post('/api/webhooks/razorpay', {
    headers: {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': createHmac('sha256', razorpay.webhookSecret)
        .update(body)
        .digest('hex'),
      'X-Razorpay-Event-Id': `evt_${event}_${String(Date.now())}`,
    },
    data: body,
  });
  expect(res.ok(), await res.text()).toBe(true);
}

/** The subscription the fake Razorpay made for `email`, once Checkout has run. */
async function latestSubscription(page: Page, email: string) {
  let subscription: { id: string; plan_id: string; customer_id: string } | undefined;
  await expect
    .poll(async () => {
      const res = await page.request.get(
        `${fakeServices}/razorpay/__last?email=${encodeURIComponent(email)}`,
      );
      subscription = res.ok() ? ((await res.json()) as typeof subscription) : undefined;
      return subscription?.id;
    })
    .toBeTruthy();
  if (!subscription) throw new Error('No subscription');
  return subscription;
}

test.describe('billing', () => {
  test.skip(live, 'Runs against the fake Razorpay');

  test('buys Pro through Checkout, confirmed by the webhook, then cancels it', async ({ page }) => {
    // Checkout, the webhooks and the page catching up take a while on a cold dev server.
    test.setTimeout(60_000);
    const email = await newOwner(page, 'billing');
    await expect(page.getByText('Free forever, with the essentials.')).toBeVisible();

    await page.getByRole('radio', { name: /Yearly/ }).click();
    await page.getByRole('button', { name: 'Upgrade to Pro' }).click();
    const checkout = page.getByRole('dialog', { name: 'Razorpay test checkout' });
    await expect(checkout).toContainText('Pro, yearly');
    await checkout.getByRole('button', { name: 'Pay with test card' }).click();

    // Razorpay confirms the payment with its webhooks; the page waits for them.
    const subscription = await latestSubscription(page, email);
    const now = Math.floor(Date.now() / 1000);
    const entity = {
      ...subscription,
      status: 'active',
      current_start: now,
      current_end: now + 365 * DAY_S,
    };
    await sendWebhook(page, 'subscription.activated', { subscription: entity });
    await sendWebhook(page, 'subscription.charged', {
      subscription: entity,
      payment: {
        id: `pay_${subscription.id}`,
        amount: 299_000,
        currency: 'INR',
        status: 'captured',
        invoice_id: `inv_${subscription.id}`,
        created_at: now,
      },
    });

    await expect(page.getByText('Welcome to Pro')).toBeVisible();
    await expect(page.getByText(/^Renews on .*, yearly\.$/)).toBeVisible();
    const payments = page.getByRole('table', { name: 'Payments' });
    await expect(payments.getByRole('cell', { name: '₹2,990' })).toBeVisible();
    await expect(payments.getByText('Paid')).toBeVisible();
    await expect(payments.getByRole('link', { name: /Invoice/ })).toHaveAttribute(
      'href',
      `https://rzp.io/i/inv_${subscription.id}`,
    );

    await page.getByRole('button', { name: 'Cancel plan' }).click();
    const cancel = page.getByRole('dialog', { name: 'Cancel Pro?' });
    await cancel.getByRole('radio', { name: /not using it enough/ }).click();
    await cancel.getByRole('button', { name: 'Cancel Pro' }).click();
    await expect(page.getByText(/^Pro ends on /)).toBeVisible();
    await expect(page.getByText(/^Ends on .*You won’t be charged again\.$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume Pro' })).toBeVisible();
  });

  test('changes nothing when Checkout is closed', async ({ page }) => {
    await newOwner(page, 'billing-closed');
    await page.getByRole('button', { name: 'Upgrade to Business' }).click();
    const checkout = page.getByRole('dialog', { name: 'Razorpay test checkout' });
    await checkout.getByRole('button', { name: 'Close' }).click();

    await expect(page.getByRole('button', { name: 'Upgrade to Business' })).toBeEnabled();
    await expect(page.getByText('Free forever, with the essentials.')).toBeVisible();
    await expect(page.getByText('The upgrade didn’t go through')).toHaveCount(0);
  });

  test('shows prices and the comparison on the pricing page', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1, name: 'Pricing' })).toBeVisible();
    await page.getByRole('radio', { name: /Yearly/ }).click();
    await expect(page.getByRole('region', { name: 'Plans' }).getByText('₹9,990')).toBeVisible();
    await expect(page.getByRole('table', { name: 'What each plan includes' })).toBeVisible();
  });
});

test('live: opens Razorpay’s own Checkout for the plan', async ({ page }) => {
  test.skip(!live, 'Set RAZORPAY_E2E=live, with test-mode keys and plans in apps/api/.env');
  await newOwner(page, 'billing-live');
  await page.getByRole('button', { name: 'Upgrade to Pro' }).click();
  // Razorpay's window: from here a person can pay with one of Razorpay's test cards.
  await expect(page.locator('iframe[src*="razorpay.com"]').first()).toBeVisible({
    timeout: 30_000,
  });
});
