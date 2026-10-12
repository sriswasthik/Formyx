const DAY_MS = 24 * 60 * 60 * 1000;

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** "12 November 2026", in the person's time zone. */
export function formatBillingDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** Whole days until `iso`, rounded up: 2.5 days left is 3. Zero once it has passed. */
export function daysLeft(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS));
}
