import { afterEach, describe, expect, it } from 'vitest';
import { startOfDayIn } from '../forms/analytics.js';
import { formatDateTime } from '../i18n/format.js';
import { formAvailability } from './access.js';
import { accessSettingsSchema, createDefaultLiveSettings } from './live-settings.js';

/*
 * Schedules are moments, stored in UTC, and shown in the workspace's time zone. Nothing may
 * depend on the time zone the server (or a test machine) happens to run in.
 */

const SERVER_ZONES = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Auckland'];
const original = process.env.TZ;
afterEach(() => {
  process.env.TZ = original;
});

const access = createDefaultLiveSettings().access;

describe.each(SERVER_ZONES)('on a server in %s', (zone) => {
  it('stores opening and closing times in UTC, whatever offset they came in', () => {
    process.env.TZ = zone;
    const parsed = accessSettingsSchema.parse({
      ...access,
      opensAt: '2026-10-01T09:30:00+05:30',
      closesAt: '2026-10-01T05:00:00-07:00',
    });

    expect(parsed.opensAt).toBe('2026-10-01T04:00:00.000Z');
    expect(parsed.closesAt).toBe('2026-10-01T12:00:00.000Z');
  });

  it('compares moments, not how they are written', () => {
    process.env.TZ = zone;
    // Opens 04:30 UTC and closes 05:00 UTC: as text, the closing time looks earlier.
    const result = accessSettingsSchema.safeParse({
      ...access,
      opensAt: '2026-10-01T10:00:00+05:30',
      closesAt: '2026-10-01T05:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('opens and closes at the exact moment', () => {
    process.env.TZ = zone;
    const scheduled = {
      ...access,
      opensAt: '2026-10-01T04:00:00.000Z',
      closesAt: '2026-10-01T12:00:00.000Z',
    };
    const at = (iso: string) =>
      formAvailability({
        status: 'PUBLISHED',
        access: scheduled,
        responseCount: 0,
        now: new Date(iso),
      }).state;

    expect(at('2026-10-01T03:59:59.999Z')).toBe('not_open');
    expect(at('2026-10-01T04:00:00.000Z')).toBe('open');
    expect(at('2026-10-01T11:59:59.999Z')).toBe('open');
    expect(at('2026-10-01T12:00:00.000Z')).toBe('closed');
  });

  it('says when a form opens in the workspace’s time zone', () => {
    process.env.TZ = zone;
    const opensAt = '2026-10-01T04:00:00.000Z';

    expect(formatDateTime(opensAt, 'Asia/Kolkata')).toContain('9:30');
    expect(formatDateTime(opensAt, 'America/New_York')).toContain('12:00');
    expect(formatDateTime(opensAt, 'UTC')).toContain('4:00');
  });

  it('starts the workspace’s day at its own midnight, across clock changes', () => {
    process.env.TZ = zone;
    // New York's clocks went back at 2am on 1 November 2026.
    const afterChange = new Date('2026-11-01T18:00:00Z');

    expect(startOfDayIn('America/New_York', afterChange).toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
    // 11:30pm on 1 November there, a day that began at 6:30pm UTC the day before.
    expect(startOfDayIn('Asia/Kolkata', afterChange).toISOString()).toBe(
      '2026-10-31T18:30:00.000Z',
    );
  });
});
