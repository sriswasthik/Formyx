const pad = (value: number) => String(value).padStart(2, '0');

/** An ISO date-time as a `datetime-local` value (`2026-10-01T09:30`) in the browser's zone. */
export function toDateTimeLocal(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** A `datetime-local` value, read in the browser's zone, as an ISO date-time in UTC. */
export function fromDateTimeLocal(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
