import { z } from 'zod';
import type { Plan } from './entitlements/plans.js';

/*
 * Growth loops. A referral: someone shares their link (`/?ref=<code>`); a friend who signs up
 * through it gets a longer trial, and when the friend first pays, the person who referred them
 * gets a month free. The "Made with Formyx" badge on free forms links home with `?ref=badge`,
 * so sign-ups it brings are counted.
 */

/** Codes avoid letters and digits that look alike (0/O, 1/I/L). */
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_LENGTH = 8;
export const referralCodeSchema = z
  .string()
  .regex(new RegExp(`^[${REFERRAL_CODE_ALPHABET}]{${String(REFERRAL_CODE_LENGTH)}}$`));

/** A friend's trial, instead of the usual one. */
export const REFERRED_TRIAL_DAYS = 60;
/** What the person who referred them gets when the friend first pays: a month of this plan. */
export const REFERRAL_REWARD_PLAN: Plan = 'PRO';
export const REFERRAL_REWARD_DAYS = 30;
/** At most this many rewards per person, so a referral link cannot be farmed. */
export const REFERRAL_REWARD_LIMIT = 12;

/** Where a sign-up came from, when we know: so far only the badge on free forms. */
export const SIGNUP_SOURCES = ['badge'] as const;
export const signupSourceSchema = z.enum(SIGNUP_SOURCES);
export type SignupSource = z.infer<typeof signupSourceSchema>;

/** What a `ref` link parameter means. */
export type RefParam =
  { kind: 'source'; source: SignupSource } | { kind: 'referral'; code: string } | null;

export function parseRefParam(value: string | null | undefined): RefParam {
  if (!value) return null;
  const source = signupSourceSchema.safeParse(value.toLowerCase());
  if (source.success) return { kind: 'source', source: source.data };
  const code = referralCodeSchema.safeParse(value.toUpperCase());
  return code.success ? { kind: 'referral', code: code.data } : null;
}

/** A new random code. Pass the platform's secure random bytes. */
export function makeReferralCode(randomBytes: (count: number) => Uint8Array): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  // 31 letters: the modulo bias is a fraction of a percent, which a code can live with.
  return Array.from(
    bytes,
    (byte) => REFERRAL_CODE_ALPHABET[byte % REFERRAL_CODE_ALPHABET.length] ?? 'A',
  ).join('');
}

/** `GET /api/public/referrals/:code`: whether a code is real, for the sign-up page. */
export const referralLookupSchema = z.object({
  /** The person's first name, to say who invited them. */
  referrerName: z.string(),
  trialDays: z.number().int(),
});
export type ReferralLookup = z.infer<typeof referralLookupSchema>;

export const REFERRAL_REWARDS = ['complimentary', 'paused'] as const;

/** `GET /api/referrals`: the signed-in person's link and how their referrals are doing. */
export const referralSummarySchema = z.object({
  code: referralCodeSchema,
  friends: z.array(
    z.object({
      /** First name only. */
      name: z.string(),
      joinedAt: z.iso.datetime(),
      /** When their reward was given (the friend's first payment). */
      rewardedAt: z.iso.datetime().nullable(),
      reward: z.enum(REFERRAL_REWARDS).nullable(),
    }),
  ),
  rewardsEarned: z.number().int(),
  rewardLimit: z.number().int(),
});
export type ReferralSummary = z.infer<typeof referralSummarySchema>;
