import { describe, expect, it } from 'vitest';
import {
  entitlementsSchema,
  getLimit,
  hasFeature,
  missingFeatures,
  resolveEntitlements,
} from './entitlements.js';
import { FEATURE_IDS, LIMIT_IDS, type FeatureId, type LimitId } from './features.js';
import { effectivePlan, PLANS, type Plan, type WorkspaceBilling } from './plans.js';

/** What each plan includes: the product decision these tests pin down. */
const FEATURE_MATRIX: Record<FeatureId, Record<Plan, boolean>> = {
  premium_fonts: { FREE: false, PRO: true, BUSINESS: true },
  premium_textures: { FREE: false, PRO: true, BUSINESS: true },
  mesh_gradients: { FREE: false, PRO: true, BUSINESS: true },
  custom_shapes: { FREE: false, PRO: true, BUSINESS: true },
  conversational_layout: { FREE: false, PRO: true, BUSINESS: true },
  remove_branding: { FREE: false, PRO: true, BUSINESS: true },
  ai_generate: { FREE: false, PRO: true, BUSINESS: true },
  ai_insights: { FREE: false, PRO: false, BUSINESS: true },
  google_sheets: { FREE: false, PRO: true, BUSINESS: true },
  notion: { FREE: false, PRO: true, BUSINESS: true },
  advanced_logic: { FREE: false, PRO: true, BUSINESS: true },
  quiz_mode: { FREE: false, PRO: true, BUSINESS: true },
  verified_responses: { FREE: false, PRO: true, BUSINESS: true },
  autoresponder: { FREE: false, PRO: true, BUSINESS: true },
  chat_notifications: { FREE: false, PRO: true, BUSINESS: true },
  extra_recipients: { FREE: false, PRO: true, BUSINESS: true },
  custom_social: { FREE: false, PRO: true, BUSINESS: true },
  excel_export: { FREE: false, PRO: true, BUSINESS: true },
};

const LIMIT_MATRIX: Record<LimitId, Record<Plan, number | null>> = {
  responses_per_month: { FREE: 100, PRO: 10_000, BUSINESS: null },
  file_upload_size_mb: { FREE: 10, PRO: 25, BUSINESS: 100 },
  ai_credits_per_month: { FREE: 20, PRO: 500, BUSINESS: 2000 },
  brand_kits: { FREE: 1, PRO: 10, BUSINESS: null },
};

const cases = <T extends string>(ids: readonly T[]) =>
  ids.flatMap((id) => PLANS.map((plan) => [plan, id] as const));

describe('hasFeature', () => {
  it('covers every feature in the matrix', () => {
    expect(Object.keys(FEATURE_MATRIX).sort()).toEqual([...FEATURE_IDS].sort());
  });

  it.each(cases(FEATURE_IDS))('%s: %s', (plan, featureId) => {
    expect(hasFeature(plan, featureId)).toBe(FEATURE_MATRIX[featureId][plan]);
  });

  it('never takes a feature away on a bigger plan', () => {
    for (const featureId of FEATURE_IDS) {
      const included = PLANS.map((plan) => hasFeature(plan, featureId));
      expect(included).toEqual([...included].sort((a, b) => Number(a) - Number(b)));
    }
  });
});

describe('getLimit', () => {
  it('covers every limit in the matrix', () => {
    expect(Object.keys(LIMIT_MATRIX).sort()).toEqual([...LIMIT_IDS].sort());
  });

  it.each(cases(LIMIT_IDS))('%s: %s', (plan, limitId) => {
    expect(getLimit(plan, limitId)).toBe(LIMIT_MATRIX[limitId][plan]);
  });

  it('allows more (or no limit) on bigger plans', () => {
    for (const limitId of LIMIT_IDS) {
      const values = PLANS.map((plan) => getLimit(plan, limitId) ?? Infinity);
      expect(values).toEqual([...values].sort((a, b) => a - b));
    }
  });
});

const now = new Date('2026-10-04T12:00:00Z');
const billing = (overrides: Partial<WorkspaceBilling> = {}): WorkspaceBilling => ({
  plan: 'PRO',
  planStatus: 'ACTIVE',
  trialEndsAt: null,
  ...overrides,
});

describe('effectivePlan', () => {
  it.each([
    ['an active plan', billing(), 'PRO'],
    ['a plan past due, without a grace end', billing({ planStatus: 'PAST_DUE' }), 'PRO'],
    [
      'a plan past due, during the grace period',
      billing({ planStatus: 'PAST_DUE', graceEndsAt: new Date('2026-10-05T00:00:00Z') }),
      'PRO',
    ],
    [
      'a plan past due, after the grace period',
      billing({ planStatus: 'PAST_DUE', graceEndsAt: new Date('2026-10-04T12:00:00Z') }),
      'FREE',
    ],
    ['a cancelled plan', billing({ planStatus: 'CANCELED' }), 'FREE'],
    [
      'a complimentary plan over Free',
      billing({
        plan: 'FREE',
        complimentaryPlan: 'PRO',
        complimentaryUntil: new Date('2026-11-01T00:00:00Z'),
      }),
      'PRO',
    ],
    [
      'a complimentary plan below the paid one',
      billing({
        plan: 'BUSINESS',
        complimentaryPlan: 'PRO',
        complimentaryUntil: new Date('2026-11-01T00:00:00Z'),
      }),
      'BUSINESS',
    ],
    [
      'a complimentary plan after a trial ended',
      billing({
        planStatus: 'TRIALING',
        trialEndsAt: new Date('2026-10-01T00:00:00Z'),
        complimentaryPlan: 'BUSINESS',
        complimentaryUntil: new Date('2026-11-01T00:00:00Z'),
      }),
      'BUSINESS',
    ],
    [
      'an expired complimentary plan',
      billing({
        plan: 'FREE',
        complimentaryPlan: 'PRO',
        complimentaryUntil: new Date('2026-10-04T12:00:00Z'),
      }),
      'FREE',
    ],
    [
      'a running trial',
      billing({ planStatus: 'TRIALING', trialEndsAt: new Date('2026-10-05T00:00:00Z') }),
      'PRO',
    ],
    [
      'an ended trial',
      billing({ planStatus: 'TRIALING', trialEndsAt: new Date('2026-10-04T11:59:59Z') }),
      'FREE',
    ],
    ['a trial without an end', billing({ planStatus: 'TRIALING' }), 'FREE'],
    // Boundary: the grace period ends at exactly now — access drops to FREE at that instant
    // because billedPlan uses `graceEndsAt > now` (strict greater-than).
    [
      'a plan past due at the exact grace expiry moment',
      billing({ planStatus: 'PAST_DUE', graceEndsAt: now }),
      'FREE',
    ],
    // Boundary: one millisecond before expiry — access is still Pro.
    [
      'a plan past due one millisecond before grace expires',
      billing({
        planStatus: 'PAST_DUE',
        graceEndsAt: new Date(now.getTime() + 1),
      }),
      'PRO',
    ],
    // Boundary: trial ends at exactly now — access drops to FREE at that instant.
    [
      'a trial ending at the exact expiry moment',
      billing({ planStatus: 'TRIALING', trialEndsAt: now }),
      'FREE',
    ],
    // A cancelled plan gets FREE from billedPlan, but an active complimentary plan lifts it.
    [
      'a cancelled plan with an active complimentary plan',
      billing({
        planStatus: 'CANCELED',
        complimentaryPlan: 'PRO',
        complimentaryUntil: new Date('2026-11-01T00:00:00Z'),
      }),
      'PRO',
    ],
    // PAST_DUE without graceEndsAt keeps the plan; a higher complimentary plan lifts it further.
    [
      'a plan past due with no grace end and a higher complimentary plan',
      billing({
        plan: 'PRO',
        planStatus: 'PAST_DUE',
        complimentaryPlan: 'BUSINESS',
        complimentaryUntil: new Date('2026-11-01T00:00:00Z'),
      }),
      'BUSINESS',
    ],
  ] as const)('%s', (_case, value, expected) => {
    expect(effectivePlan(value, now)).toBe(expected);
  });
});

describe('resolveEntitlements', () => {
  it('gives each workspace what its plan includes when enforced', () => {
    const free = resolveEntitlements(billing({ plan: 'FREE' }), 'enforced', now);
    expect(entitlementsSchema.parse(free)).toEqual(free);
    expect(free).toMatchObject({ mode: 'enforced', plan: 'FREE', planStatus: 'ACTIVE' });
    expect(Object.values(free.features).every((included) => !included)).toBe(true);
    expect(free.limits).toEqual({
      responses_per_month: 100,
      file_upload_size_mb: 10,
      ai_credits_per_month: 20,
      brand_kits: 1,
    });

    const pro = resolveEntitlements(billing(), 'enforced', now);
    expect(pro.features).toMatchObject({ mesh_gradients: true, ai_insights: false });
  });

  it('falls back to Free when a trial has ended', () => {
    const ended = resolveEntitlements(
      billing({ planStatus: 'TRIALING', trialEndsAt: new Date('2026-10-01T00:00:00Z') }),
      'enforced',
      now,
    );
    expect(ended).toMatchObject({
      plan: 'PRO',
      effectivePlan: 'FREE',
      trialEndsAt: '2026-10-01T00:00:00.000Z',
    });
    expect(ended.features.mesh_gradients).toBe(false);
  });

  it('reports a complimentary plan only while it lasts', () => {
    const until = new Date('2026-11-01T00:00:00Z');
    const given = resolveEntitlements(
      billing({ plan: 'FREE', complimentaryPlan: 'PRO', complimentaryUntil: until }),
      'enforced',
      now,
    );
    expect(entitlementsSchema.parse(given)).toEqual(given);
    expect(given).toMatchObject({
      plan: 'FREE',
      effectivePlan: 'PRO',
      complimentaryPlan: 'PRO',
      complimentaryUntil: '2026-11-01T00:00:00.000Z',
    });
    expect(given.features.premium_fonts).toBe(true);

    const over = resolveEntitlements(
      billing({ plan: 'FREE', complimentaryPlan: 'PRO', complimentaryUntil: now }),
      'enforced',
      now,
    );
    expect(over).toMatchObject({ effectivePlan: 'FREE', complimentaryPlan: null });
  });

  it('unlocks everything for everyone in all_unlocked mode', () => {
    const free = resolveEntitlements(billing({ plan: 'FREE' }), 'all_unlocked', now);
    expect(free.plan).toBe('FREE');
    expect(Object.values(free.features).every(Boolean)).toBe(true);
    expect(free.limits.responses_per_month).toBeNull();
  });
});

describe('missingFeatures', () => {
  it('lists what the plan lacks, in registry order', () => {
    const free = resolveEntitlements(billing({ plan: 'FREE' }), 'enforced', now);
    const pro = resolveEntitlements(billing(), 'enforced', now);
    expect(missingFeatures(free, ['remove_branding', 'premium_fonts'])).toEqual([
      'premium_fonts',
      'remove_branding',
    ]);
    expect(missingFeatures(pro, ['remove_branding', 'ai_insights'])).toEqual(['ai_insights']);
    expect(missingFeatures(free, [])).toEqual([]);
  });
});
