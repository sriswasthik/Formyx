import { describe, expect, it } from 'vitest';
import {
  makeReferralCode,
  parseRefParam,
  REFERRAL_CODE_ALPHABET,
  referralCodeSchema,
} from './referrals.js';

describe('parseRefParam', () => {
  it('tells a source from a referral code, in any case', () => {
    expect(parseRefParam('badge')).toEqual({ kind: 'source', source: 'badge' });
    expect(parseRefParam('BADGE')).toEqual({ kind: 'source', source: 'badge' });
    expect(parseRefParam('k7mq2xpa')).toEqual({ kind: 'referral', code: 'K7MQ2XPA' });
  });

  it('ignores anything else', () => {
    for (const value of [null, undefined, '', 'twitter', 'K7MQ2XP', 'K7MQ2XP0', 'K7MQ2XPAB']) {
      expect(parseRefParam(value)).toBeNull();
    }
  });
});

describe('makeReferralCode', () => {
  it('makes valid codes from random bytes, using the whole alphabet', () => {
    const code = makeReferralCode((count) => Uint8Array.from({ length: count }, (_, i) => i * 37));
    expect(referralCodeSchema.safeParse(code).success).toBe(true);
    const all = makeReferralCode(() => Uint8Array.from({ length: 8 }, (_, i) => 30 - i));
    expect(Array.from(all).every((letter) => REFERRAL_CODE_ALPHABET.includes(letter))).toBe(true);
  });
});
