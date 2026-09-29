import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts a healthy response', () => {
    const body = { status: 'ok', uptime: 12.5, timestamp: new Date().toISOString() };
    expect(healthResponseSchema.parse(body)).toEqual(body);
  });

  it('rejects other statuses and malformed timestamps', () => {
    expect(
      healthResponseSchema.safeParse({
        status: 'down',
        uptime: 1,
        timestamp: new Date().toISOString(),
      }).success,
    ).toBe(false);
    expect(
      healthResponseSchema.safeParse({ status: 'ok', uptime: 1, timestamp: 'yesterday' }).success,
    ).toBe(false);
  });
});
