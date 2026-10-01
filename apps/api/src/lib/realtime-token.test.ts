import { REALTIME_TOKEN_TTL_SECONDS } from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import { signRealtimeToken, verifyRealtimeToken } from './realtime-token.js';
import { signSessionToken, verifySessionToken } from './session.js';

const SECRET = 'test-only-jwt-secret-with-at-least-32-chars';

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('realtime tokens', () => {
  it('carry the user id', () => {
    const { token } = signRealtimeToken('user_1', SECRET);
    expect(verifyRealtimeToken(token, SECRET)).toBe('user_1');
  });

  it('expire a minute after they are issued', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const { expiresAt } = signRealtimeToken('user_1', SECRET, now);
    expect(expiresAt.getTime() - now.getTime()).toBe(REALTIME_TOKEN_TTL_SECONDS * 1000);
  });

  it('are refused once expired', () => {
    const issued = new Date(Date.now() - (REALTIME_TOKEN_TTL_SECONDS + 1) * 1000);
    const { token } = signRealtimeToken('user_1', SECRET, issued);
    expect(verifyRealtimeToken(token, SECRET)).toBe(null);
  });

  it('are refused when signed with another secret, tampered with or malformed', () => {
    const { token } = signRealtimeToken('user_1', SECRET);
    const [header, , signature] = token.split('.');
    const forged = `${header}.${base64url({ sub: 'someone_else' })}.${signature}`;

    expect(verifyRealtimeToken(token, `${SECRET}-other`)).toBe(null);
    expect(verifyRealtimeToken(forged, SECRET)).toBe(null);
    expect(verifyRealtimeToken('not-a-token', SECRET)).toBe(null);
  });

  it('refuse unsigned tokens', () => {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = [
      base64url({ alg: 'none', typ: 'JWT' }),
      base64url({
        sub: 'user_1',
        iss: 'formyx-realtime',
        aud: 'formyx-socket',
        iat: now,
        exp: now + 60,
      }),
      '',
    ].join('.');
    expect(verifyRealtimeToken(unsigned, SECRET)).toBe(null);
  });

  it('cannot stand in for a session, and sessions cannot stand in for them', () => {
    const realtime = signRealtimeToken('user_1', SECRET).token;
    const session = signSessionToken('user_1', SECRET);

    expect(verifySessionToken(realtime, SECRET)).toBe(null);
    expect(verifyRealtimeToken(session, SECRET)).toBe(null);
  });
});
