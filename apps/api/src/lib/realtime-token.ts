import { REALTIME_TOKEN_TTL_SECONDS } from '@formyx/shared';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

/*
 * Tokens for opening a live-updates socket. The socket may live on another origin, where the
 * session cookie is not sent, so the browser asks for one of these and hands it over in the
 * handshake. They are signed with the session secret but carry their own issuer and audience:
 * a realtime token is refused as a session, and a session token is refused here.
 */

const ISSUER = 'formyx-realtime';
const AUDIENCE = 'formyx-socket';
const payloadSchema = z.object({ sub: z.string().min(1) });

export function signRealtimeToken(
  userId: string,
  secret: string,
  now: Date = new Date(),
): { token: string; expiresAt: Date } {
  const issuedAt = Math.floor(now.getTime() / 1000);
  // `expiresIn` counts from `iat`, so passing `now` lets tests mint expired tokens.
  const token = jwt.sign({ iat: issuedAt }, secret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: REALTIME_TOKEN_TTL_SECONDS,
  });
  return { token, expiresAt: new Date((issuedAt + REALTIME_TOKEN_TTL_SECONDS) * 1000) };
}

/** The user id of a valid, unexpired realtime token, or `null` for anything else. */
export function verifyRealtimeToken(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const parsed = payloadSchema.safeParse(payload);
    return parsed.success ? parsed.data.sub : null;
  } catch {
    return null;
  }
}
