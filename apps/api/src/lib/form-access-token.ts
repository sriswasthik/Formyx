import jwt from 'jsonwebtoken';
import { z } from 'zod';

/*
 * Tokens respondents' browsers hold for one form, signed with the session secret but with an
 * issuer and audience of their own, so neither works as a session (or as the other):
 *
 * - An unlock token, from typing a form's password. It names the password's version, so
 *   changing the password locks everyone out again.
 * - A verified-email token, from typing the code emailed to an address. It names the
 *   address, which then counts as the respondent for one response per person.
 */

const ISSUER = 'formyx-forms';
const UNLOCK_AUDIENCE = 'formyx-form-unlock';
const EMAIL_AUDIENCE = 'formyx-form-email';

export const UNLOCK_TOKEN_TTL_SECONDS = 12 * 60 * 60;
export const EMAIL_TOKEN_TTL_SECONDS = 2 * 60 * 60;

const unlockPayload = z.object({ sub: z.string().min(1), pv: z.number().int() });
const emailPayload = z.object({ sub: z.string().min(1), email: z.string().min(3) });

function sign(
  payload: Record<string, unknown>,
  { formId, audience, ttl, secret, now }: SignOptions,
): string {
  // `expiresIn` counts from `iat`, so passing `now` lets tests mint expired tokens.
  return jwt.sign({ ...payload, iat: Math.floor(now.getTime() / 1000) }, secret, {
    algorithm: 'HS256',
    subject: formId,
    issuer: ISSUER,
    audience,
    expiresIn: ttl,
  });
}

interface SignOptions {
  formId: string;
  audience: string;
  ttl: number;
  secret: string;
  now: Date;
}

function verify(token: string, secret: string, audience: string): unknown {
  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER, audience });
  } catch {
    return null;
  }
}

export function signUnlockToken(
  formId: string,
  passwordVersion: number,
  secret: string,
  now: Date = new Date(),
): string {
  return sign(
    { pv: passwordVersion },
    { formId, audience: UNLOCK_AUDIENCE, ttl: UNLOCK_TOKEN_TTL_SECONDS, secret, now },
  );
}

/** Whether `token` unlocks the form `formId` at its current password version. */
export function isUnlockTokenValid(
  token: string | undefined,
  formId: string,
  passwordVersion: number,
  secret: string,
): boolean {
  if (!token) return false;
  const parsed = unlockPayload.safeParse(verify(token, secret, UNLOCK_AUDIENCE));
  return parsed.success && parsed.data.sub === formId && parsed.data.pv === passwordVersion;
}

export function signEmailToken(
  formId: string,
  email: string,
  secret: string,
  now: Date = new Date(),
): string {
  return sign(
    { email },
    { formId, audience: EMAIL_AUDIENCE, ttl: EMAIL_TOKEN_TTL_SECONDS, secret, now },
  );
}

/** The confirmed address `token` carries for the form `formId`, or `null`. */
export function verifiedEmail(
  token: string | undefined,
  formId: string,
  secret: string,
): string | null {
  if (!token) return null;
  const parsed = emailPayload.safeParse(verify(token, secret, EMAIL_AUDIENCE));
  return parsed.success && parsed.data.sub === formId ? parsed.data.email : null;
}
