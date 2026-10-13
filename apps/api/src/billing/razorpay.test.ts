import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '../config/env.js';
import {
  FAKE_PLAN_IDS,
  FAKE_RAZORPAY_KEY_SECRET,
  FAKE_RAZORPAY_WEBHOOK_SECRET,
  startFakeRazorpay,
  type FakeRazorpay,
} from '../test/fake-razorpay.js';
import { checkRazorpayPlans } from './plan-check.js';
import {
  billingConfigured,
  checkoutSignatureValid,
  createRazorpayClient,
  planForRazorpayPlan,
  RazorpayError,
  signForTests,
  webhookSignatureValid,
} from './razorpay.js';

const env = (extra: Record<string, string> = {}) =>
  parseEnv({
    DATABASE_URL: 'postgresql://localhost/formyx_test',
    JWT_SECRET: 'x'.repeat(32),
    ...extra,
  });

describe('Checkout signatures', () => {
  const signature = signForTests(FAKE_RAZORPAY_KEY_SECRET, 'pay_abc|sub_xyz');

  it('accepts Razorpay’s signature for the payment and subscription', () => {
    expect(
      checkoutSignatureValid(FAKE_RAZORPAY_KEY_SECRET, {
        paymentId: 'pay_abc',
        subscriptionId: 'sub_xyz',
        signature,
      }),
    ).toBe(true);
  });

  it.each([
    ['another payment', { paymentId: 'pay_other', subscriptionId: 'sub_xyz', signature }],
    ['another subscription', { paymentId: 'pay_abc', subscriptionId: 'sub_other', signature }],
    [
      'a made-up signature',
      { paymentId: 'pay_abc', subscriptionId: 'sub_xyz', signature: 'f'.repeat(64) },
    ],
    ['a short signature', { paymentId: 'pay_abc', subscriptionId: 'sub_xyz', signature: 'abcd' }],
    ['no signature', { paymentId: 'pay_abc', subscriptionId: 'sub_xyz', signature: '' }],
  ])('refuses %s', (_case, input) => {
    expect(checkoutSignatureValid(FAKE_RAZORPAY_KEY_SECRET, input)).toBe(false);
  });

  it('refuses one signed with another secret', () => {
    expect(
      checkoutSignatureValid('another-secret', {
        paymentId: 'pay_abc',
        subscriptionId: 'sub_xyz',
        signature,
      }),
    ).toBe(false);
  });
});

describe('webhook signatures', () => {
  const body = Buffer.from('{"event":"subscription.charged","payload":{}}');
  const signature = signForTests(FAKE_RAZORPAY_WEBHOOK_SECRET, body);

  it('accepts the signature of the exact body', () => {
    expect(webhookSignatureValid(FAKE_RAZORPAY_WEBHOOK_SECRET, body, signature)).toBe(true);
  });

  it('refuses a tampered body, another secret and a missing signature', () => {
    const tampered = Buffer.from(body.toString().replace('charged', 'activated'));
    expect(webhookSignatureValid(FAKE_RAZORPAY_WEBHOOK_SECRET, tampered, signature)).toBe(false);
    expect(webhookSignatureValid('another-secret', body, signature)).toBe(false);
    expect(webhookSignatureValid(FAKE_RAZORPAY_WEBHOOK_SECRET, body, '')).toBe(false);
  });
});

describe('settings', () => {
  it('refuses live keys unless RAZORPAY_LIVE is on', () => {
    expect(() => env({ RAZORPAY_KEY_ID: 'rzp_live_abc123' })).toThrow(/RAZORPAY_LIVE/);
    expect(env({ RAZORPAY_KEY_ID: 'rzp_test_abc123' }).RAZORPAY_KEY_ID).toBe('rzp_test_abc123');
  });

  it('needs keys, the webhook secret and every plan for checkout', () => {
    const keys = {
      RAZORPAY_KEY_ID: 'rzp_test_abc',
      RAZORPAY_KEY_SECRET: 'secret',
      RAZORPAY_WEBHOOK_SECRET: 'hook',
    };
    expect(billingConfigured(env())).toBe(false);
    expect(billingConfigured(env(keys))).toBe(false);
    expect(billingConfigured(env({ ...keys, ...FAKE_PLAN_IDS }))).toBe(true);
    const { RAZORPAY_PLAN_BUSINESS_YEARLY: _missing, ...three } = FAKE_PLAN_IDS;
    expect(billingConfigured(env({ ...keys, ...three }))).toBe(false);
  });

  it('knows which plan a Razorpay plan id is', () => {
    const configured = env(FAKE_PLAN_IDS);
    expect(planForRazorpayPlan(configured, 'plan_businessyearly')).toEqual({
      plan: 'BUSINESS',
      interval: 'yearly',
    });
    expect(planForRazorpayPlan(configured, 'plan_someoneelses')).toBeNull();
  });
});

describe('the client and the plan check', () => {
  let razorpay: FakeRazorpay;
  beforeAll(async () => {
    razorpay = await startFakeRazorpay();
  });
  afterAll(async () => {
    await razorpay.close();
  });

  it('finds the plans match the prices', async () => {
    const checks = await checkRazorpayPlans(
      env(razorpay.env),
      createRazorpayClient(env(razorpay.env)),
    );
    expect(checks.map((check) => check.problem)).toEqual([null, null, null, null]);
  });

  it('says which plan charges the wrong amount, is missing or is not set', async () => {
    const settings = env({ ...razorpay.env, RAZORPAY_PLAN_PRO_YEARLY: 'plan_gone' });
    const proMonthly = razorpay.plans.get('plan_promonthly');
    if (!proMonthly) throw new Error('No plan');
    proMonthly.item.amount = 19_900;
    const checks = await checkRazorpayPlans(
      { ...settings, RAZORPAY_PLAN_BUSINESS_YEARLY: undefined },
      createRazorpayClient(settings),
    );
    proMonthly.item.amount = 29_900;
    expect(checks.map(({ env: name, problem }) => [name, problem])).toEqual([
      ['RAZORPAY_PLAN_PRO_MONTHLY', 'Charges ₹199 INR monthly; should be ₹299 INR every month'],
      ['RAZORPAY_PLAN_PRO_YEARLY', 'Razorpay has no plan with this id'],
      ['RAZORPAY_PLAN_BUSINESS_MONTHLY', null],
      ['RAZORPAY_PLAN_BUSINESS_YEARLY', 'Not set'],
    ]);
  });

  it('makes the missing plans when asked', async () => {
    const settings = env({ ...razorpay.env });
    const checks = await checkRazorpayPlans(
      { ...settings, RAZORPAY_PLAN_PRO_MONTHLY: undefined },
      createRazorpayClient(settings),
      { create: true },
    );
    const made = checks.find((check) => check.created);
    expect(made).toMatchObject({ env: 'RAZORPAY_PLAN_PRO_MONTHLY', problem: null });
    expect(razorpay.plans.get(made?.planId ?? '')?.item.amount).toBe(29_900);
  });

  it('turns Razorpay’s errors into RazorpayError', async () => {
    const client = createRazorpayClient(env(razorpay.env));
    await expect(client.fetchSubscription('sub_nothere')).rejects.toBeInstanceOf(RazorpayError);
    const wrongKeys = createRazorpayClient(env({ ...razorpay.env, RAZORPAY_KEY_SECRET: 'wrong' }));
    await expect(wrongKeys.fetchPlan('plan_promonthly')).rejects.toMatchObject({ status: 401 });
  });
});
