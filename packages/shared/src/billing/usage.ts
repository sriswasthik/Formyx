import { USAGE_WARNING_THRESHOLDS } from '../entitlements/pricing.js';

/** A stretch of time usage is counted over: from `start`, up to but not including `end`. */
export interface UsagePeriod {
  start: Date;
  end: Date;
}

/**
 * The period usage limits count over, and reset after: the paid billing period when `now` is
 * in one, otherwise the calendar month (UTC) `now` is in.
 */
export function usagePeriod(
  billingPeriod: { start: Date | null; end: Date | null } | null,
  now: Date = new Date(),
): UsagePeriod {
  if (
    billingPeriod?.start &&
    billingPeriod.end &&
    billingPeriod.start <= now &&
    now < billingPeriod.end
  ) {
    return { start: billingPeriod.start, end: billingPeriod.end };
  }
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 1)) };
}

export type UsageThreshold = (typeof USAGE_WARNING_THRESHOLDS)[number];

/**
 * The highest warning threshold (80%, 100%) that going from `before` to `after` crossed, if
 * any: the owner is warned once at each. No limit, no warning.
 */
export function crossedThreshold(
  before: number,
  after: number,
  limit: number | null,
): UsageThreshold | null {
  if (limit === null || limit <= 0) return null;
  let crossed: UsageThreshold | null = null;
  for (const threshold of USAGE_WARNING_THRESHOLDS) {
    const at = Math.ceil(limit * threshold);
    if (before < at && after >= at) crossed = threshold;
  }
  return crossed;
}

/** Whether `used` has reached `limit`. No limit is never reached. */
export function limitReached(used: number, limit: number | null): boolean {
  return limit !== null && used >= limit;
}
