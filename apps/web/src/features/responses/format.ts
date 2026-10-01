const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const integerFormat = new Intl.NumberFormat();

export function formatCount(count: number): string {
  return integerFormat.format(count);
}

/** A number as people write it: grouped, with at most `fractionDigits` decimals. */
export function formatNumber(value: number, fractionDigits = 2): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: fractionDigits }).format(value);
}

/** A share (0–1) as a percentage; small non-zero shares keep a decimal so they don't read as 0%. */
export function formatPercent(share: number): string {
  const precise = share > 0 && share < 0.1;
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: precise ? 1 : 0,
  }).format(share);
}

/** A short duration: `<1s`, `42s`, `1m 24s`, `2h 5m`. */
export function formatDuration(ms: number): string {
  if (ms < SECOND) return '<1s';
  if (ms < MINUTE) return `${Math.round(ms / SECOND)}s`;
  if (ms < HOUR) {
    const minutes = Math.floor(ms / MINUTE);
    const seconds = Math.round((ms % MINUTE) / SECOND);
    return seconds === 60
      ? `${minutes + 1}m`
      : seconds === 0
        ? `${minutes}m`
        : `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(ms / HOUR);
  const minutes = Math.round((ms % HOUR) / MINUTE);
  return minutes === 60 ? `${hours + 1}h` : minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** The calendar date of a `YYYY-MM-DD` key (a date answer, a chart day), read without time zone shifts. */
function calendarDate(key: string): Date {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** A date answer or chart day: `30 Sept 2026` (in the reader's locale). */
export function formatCalendarDate(
  key: string,
  style: 'short' | 'medium' | 'long' = 'medium',
): string {
  const options: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { month: 'short', day: 'numeric' }
      : style === 'long'
        ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
        : { dateStyle: 'medium' };
  return calendarDate(key).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
}

/** The reader's time zone, which analytics count days in. */
export function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
