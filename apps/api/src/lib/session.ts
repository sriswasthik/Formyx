import type { CookieOptions, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Env } from '../config/env.js';

export const SESSION_COOKIE = 'formyx_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const ISSUER = 'formyx-api';
const payloadSchema = z.object({ sub: z.string().min(1) });

type SessionEnv = Pick<Env, 'JWT_SECRET' | 'NODE_ENV'>;

export function signSessionToken(userId: string, secret: string): string {
  return jwt.sign({}, secret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    expiresIn: SESSION_TTL_SECONDS,
  });
}

/** Returns the user id of a valid, unexpired token, or `null` for anything else. */
export function verifySessionToken(token: string, secret: string): string | null {
  try {
    // Pinning the algorithm rules out "alg: none" and algorithm-confusion attacks.
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER });
    const parsed = payloadSchema.safeParse(payload);
    return parsed.success ? parsed.data.sub : null;
  } catch {
    return null;
  }
}

function baseCookieOptions(env: SessionEnv): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
  };
}

export function setSessionCookie(res: Response, userId: string, env: SessionEnv): void {
  res.cookie(SESSION_COOKIE, signSessionToken(userId, env.JWT_SECRET), {
    ...baseCookieOptions(env),
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearSessionCookie(res: Response, env: SessionEnv): void {
  // Browsers only clear a cookie when the attributes match the ones it was set with.
  res.clearCookie(SESSION_COOKIE, baseCookieOptions(env));
}

export function readSessionToken(req: Request): string | undefined {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const token = (cookies as Record<string, unknown>)[SESSION_COOKIE];
  return typeof token === 'string' && token !== '' ? token : undefined;
}
