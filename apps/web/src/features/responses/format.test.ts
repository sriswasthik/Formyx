import { describe, expect, it } from 'vitest';
import { formatCalendarDate, formatDuration, formatPercent } from './format';

describe('formatDuration', () => {
  it.each([
    [400, '<1s'],
    [42_000, '42s'],
    [60_000, '1m'],
    [84_000, '1m 24s'],
    [119_600, '2m'],
    [3_600_000, '1h'],
    [7_500_000, '2h 5m'],
    [7_190_000, '2h'],
  ])('%i ms reads as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatPercent', () => {
  it('rounds to whole percentages, keeping a decimal for small shares', () => {
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(2 / 3)).toBe('67%');
    expect(formatPercent(0.034)).toBe('3.4%');
    expect(formatPercent(0)).toBe('0%');
  });
});

describe('formatCalendarDate', () => {
  it('keeps the calendar day whatever the time zone', () => {
    // Midnight UTC is still the day before west of Greenwich; the day must not move.
    expect(formatCalendarDate('2026-09-30', 'short')).toMatch(/30/);
    expect(formatCalendarDate('2026-10-01', 'long')).toMatch(/Thursday/);
  });
});
