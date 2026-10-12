import { describe, expect, it } from 'vitest';
import { hasFeature } from './entitlements.js';
import { FEATURE_IDS } from './features.js';
import { PLANS } from './plans.js';
import {
  formatInr,
  formatLimit,
  newFeatures,
  PAID_PLANS,
  planComparison,
  PRICES,
  PRICING_FEATURE_GROUPS,
  razorpayPlanEnv,
  UNLISTED_FEATURES,
  yearlySaving,
} from './pricing.js';

describe('pricing', () => {
  it('charges whole rupees, yearly for ten months', () => {
    for (const plan of PAID_PLANS) {
      expect(PRICES[plan].monthly % 100).toBe(0);
      expect(PRICES[plan].yearly).toBe(PRICES[plan].monthly * 10);
    }
    expect(PRICES.PRO.monthly).toBeLessThan(PRICES.BUSINESS.monthly);
  });

  it('works out the yearly saving', () => {
    expect(yearlySaving('PRO')).toEqual({ amount: 59_800, percent: 17 });
    expect(yearlySaving('BUSINESS')).toEqual({ amount: 199_800, percent: 17 });
  });

  it('formats rupees the Indian way', () => {
    expect(formatInr(29_900)).toBe('₹299');
    expect(formatInr(999_000)).toBe('₹9,990');
    expect(formatInr(100_000_000)).toBe('₹10,00,000');
    expect(formatInr(29_950)).toBe('₹299.50');
  });

  it('names the environment variable for each Razorpay plan', () => {
    expect(razorpayPlanEnv('PRO', 'monthly')).toBe('RAZORPAY_PLAN_PRO_MONTHLY');
    expect(razorpayPlanEnv('BUSINESS', 'yearly')).toBe('RAZORPAY_PLAN_BUSINESS_YEARLY');
  });
});

describe('the comparison', () => {
  it('lists every feature that is built once, and leaves out the rest', () => {
    const listed = PRICING_FEATURE_GROUPS.flatMap(({ features }) => features);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed, ...UNLISTED_FEATURES].sort()).toEqual([...FEATURE_IDS].sort());
    expect(listed.some((featureId) => UNLISTED_FEATURES.includes(featureId))).toBe(false);
  });

  it('says what each plan includes as the entitlement helpers do', () => {
    for (const { rows } of planComparison().slice(1)) {
      for (const row of rows) {
        for (const plan of PLANS) {
          expect(row.values[plan], `${row.id} ${plan}`).toBe(
            hasFeature(plan, row.id as (typeof FEATURE_IDS)[number]),
          );
        }
      }
    }
  });

  it('shows limits as text', () => {
    const [limits] = planComparison();
    expect(limits?.rows.find((row) => row.id === 'responses_per_month')?.values).toEqual({
      FREE: '100',
      PRO: '10,000',
      BUSINESS: 'Unlimited',
    });
    expect(formatLimit('file_upload_size_mb', 25)).toBe('25 MB');
  });

  it('lists what a plan adds to the one below', () => {
    expect(newFeatures('FREE')).toEqual([]);
    expect(newFeatures('PRO')).toContain('premium_fonts');
    expect(newFeatures('BUSINESS')).not.toContain('premium_fonts');
  });
});
