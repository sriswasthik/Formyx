const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Compact "how long ago": `just now`, `5m ago`, `2h ago`, `3d ago`, then a date such as
 * `Sep 12` (or `Sep 12, 2025` in another year). Future times read as `just now`.
 */
export function formatRelativeTime(
  value: Date | string,
  now: Date = new Date(),
  locale?: string,
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const elapsed = now.getTime() - date.getTime();

  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;

  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Full date and time, e.g. for a tooltip next to a relative time. */
export function formatDateTime(value: Date | string, locale?: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}
