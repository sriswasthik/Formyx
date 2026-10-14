/*
 * Who runs Formyx and how to reach them, for the legal and contact pages. Fill in the
 * bracketed placeholders before launch (see docs/launch-checklist.md); `placeholders()` lists
 * what is left, and a test keeps that list from growing by accident.
 */

export const SITE = {
  product: 'Formyx',
  /** The business that runs Formyx, as registered. */
  legalName: '[Business name]',
  /** Its registered postal address, which Razorpay asks to be on the contact page. */
  address: '[Registered address, City, State, PIN]',
  /** Answered by the founder; shown on every legal page. */
  contactEmail: 'sriswasthik006@gmail.com',
  supportHours: 'Monday to Friday, 10:00 to 18:00 IST',
  replyWithin: 'two working days',
  /** Whose courts settle disputes. */
  courts: '[City], India',
  /** Days after the first payment for a plan in which it can be refunded in full. */
  refundWindowDays: 7,
  /** When the policies last changed (ISO date). */
  policiesUpdated: '2026-10-13',
} as const;

/** Fields still holding a `[placeholder]`. */
export function placeholders(): string[] {
  return Object.entries(SITE)
    .filter(([, value]) => typeof value === 'string' && /\[[^\]]+\]/.test(value))
    .map(([key]) => key);
}

export function formatPolicyDate(date: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(date),
  );
}
