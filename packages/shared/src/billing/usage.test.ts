import { describe, expect, it } from 'vitest';
import { crossedThreshold, limitReached, usagePeriod } from './usage.js';

const at = (iso: string) => new Date(iso);

describe('usagePeriod', () => {
  it('is the paid billing period when now is in it', () => {
    const period = { start: at('2026-10-10T08:00:00Z'), end: at('2026-11-10T08:00:00Z') };
    expect(usagePeriod(period, at('2026-10-20T00:00:00Z'))).toEqual(period);
  });

  it('is the calendar month without a paid period, or outside it', () => {
    const month = { start: at('2026-10-01T00:00:00Z'), end: at('2026-11-01T00:00:00Z') };
    expect(usagePeriod(null, at('2026-10-20T00:00:00Z'))).toEqual(month);
    expect(
      usagePeriod(
        { start: at('2026-09-01T00:00:00Z'), end: at('2026-10-01T00:00:00Z') },
        at('2026-10-20T00:00:00Z'),
      ),
    ).toEqual(month);
    expect(usagePeriod({ start: null, end: null }, at('2026-10-20T00:00:00Z'))).toEqual(month);
  });

  it('rolls over the year', () => {
    expect(usagePeriod(null, at('2026-12-31T23:59:59Z'))).toEqual({
      start: at('2026-12-01T00:00:00Z'),
      end: at('2027-01-01T00:00:00Z'),
    });
  });
});

describe('crossedThreshold', () => {
  it.each([
    [78, 79, 100, null],
    [79, 80, 100, 0.8],
    [80, 81, 100, null],
    [99, 100, 100, 1],
    [79, 100, 100, 1],
    [100, 120, 100, null],
    [0, 5, null, null],
    // 80% of 5 is 4.
    [3, 4, 5, 0.8],
  ] as const)('%i → %i of %s: %s', (before, after, limit, expected) => {
    expect(crossedThreshold(before, after, limit)).toBe(expected);
  });
});

describe('limitReached', () => {
  it('is reached at the limit, never without one', () => {
    expect(limitReached(99, 100)).toBe(false);
    expect(limitReached(100, 100)).toBe(true);
    expect(limitReached(1_000_000, null)).toBe(false);
  });
});
