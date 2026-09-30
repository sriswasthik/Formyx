import { describe, expect, it } from 'vitest';
import { fromDateTimeLocal, toDateTimeLocal } from './date-time';

describe('datetime-local conversion', () => {
  it('round-trips a moment through the local input format', () => {
    const iso = '2026-10-01T09:30:00.000Z';
    const local = toDateTimeLocal(iso);

    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromDateTimeLocal(local)).toBe(iso);
  });

  it('reads the input in local time', () => {
    const local = '2026-10-01T09:30';
    expect(fromDateTimeLocal(local)).toBe(new Date(2026, 9, 1, 9, 30).toISOString());
  });

  it('treats empty and invalid values as no date', () => {
    expect(toDateTimeLocal(undefined)).toBe('');
    expect(toDateTimeLocal('not a date')).toBe('');
    expect(fromDateTimeLocal('')).toBeUndefined();
    expect(fromDateTimeLocal('soon')).toBeUndefined();
  });
});
