import { afterEach, describe, expect, it } from 'vitest';
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

describe.each([
  ['Asia/Kolkata', '2026-10-01T04:00:00.000Z'],
  ['America/Los_Angeles', '2026-10-01T16:30:00.000Z'],
  ['Europe/London', '2026-10-01T08:30:00.000Z'],
  ['Pacific/Auckland', '2026-09-30T20:30:00.000Z'],
])('for a creator in %s', (zone, utc) => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  it('saves 9:30 on 1 October as that moment in UTC, and shows it back as typed', () => {
    process.env.TZ = zone;

    expect(fromDateTimeLocal('2026-10-01T09:30')).toBe(utc);
    expect(toDateTimeLocal(utc)).toBe('2026-10-01T09:30');
  });
});

describe('across a clock change', () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  it('keeps times either side of it apart', () => {
    // Los Angeles skipped from 2am to 3am on 8 March 2026.
    process.env.TZ = 'America/Los_Angeles';

    expect(fromDateTimeLocal('2026-03-08T01:30')).toBe('2026-03-08T09:30:00.000Z');
    expect(fromDateTimeLocal('2026-03-08T03:30')).toBe('2026-03-08T10:30:00.000Z');
  });
});
