import { describe, expect, it } from 'vitest';
import { formatDateTime, formatRelativeTime } from './relative-time';

const now = new Date('2026-09-30T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it.each([
    [0, 'just now'],
    [59_000, 'just now'],
    [-5 * MINUTE, 'just now'],
    [MINUTE, '1m ago'],
    [59 * MINUTE, '59m ago'],
    [2 * HOUR, '2h ago'],
    [23 * HOUR + 59 * MINUTE, '23h ago'],
    [DAY, '1d ago'],
    [6 * DAY, '6d ago'],
  ])('%i ms ago -> %j', (elapsed, expected) => {
    expect(formatRelativeTime(ago(elapsed), now, 'en-US')).toBe(expected);
  });

  it('shows a date after a week, with the year only when it differs', () => {
    expect(formatRelativeTime('2026-09-12T08:00:00Z', now, 'en-US')).toBe('Sep 12');
    expect(formatRelativeTime('2025-09-12T08:00:00Z', now, 'en-US')).toBe('Sep 12, 2025');
  });
});

describe('formatDateTime', () => {
  it('includes the date and time', () => {
    // Local time, so the assertion holds in any time zone.
    const text = formatDateTime(new Date(2026, 8, 30, 8, 5), 'en-US');
    expect(text).toMatch(/Sep 30, 2026/);
    expect(text).toMatch(/\d{1,2}:05/);
  });
});
