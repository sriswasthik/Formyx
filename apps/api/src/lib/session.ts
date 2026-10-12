import type { CookieOptions, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Env } from '../config/env.js';

export const SESSION_COOKIE = 'formyx_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const ISSUER = 'formyx-api';
/** `pv` is the account's password version: sessions from before a change stop working. */
const payloadSchema = z.object({ sub: z.string().min(1), pv: z.number().int().optional() });

type SessionEnv = Pick<Env, 'JWT_SECRET' | 'NODE_ENV'>;

export function signSessionToken(userId: string, secret: string, passwordVersion = 0): string {
  return jwt.sign({ pv: passwordVersion }, secret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    expiresIn: SESSION_TTL_SECONDS,
  });
}

export interface Session {
  userId: string;
  /** Sessions signed before passwords had versions count as version 0. */
  passwordVersion: number;
}

/** The session in a valid, unexpired token, or `null` for anything else. */
export function verifySession(token: string, secret: string): Session | null {
  try {
    // Pinning the algorithm rules out "alg: none" and algorithm-confusion attacks.
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER });
    const parsed = payloadSchema.safeParse(payload);
    return parsed.success
      ? { userId: parsed.data.sub, passwordVersion: parsed.data.pv ?? 0 }
      : null;
  } catch {
    return null;
  }
}

/** Returns the user id of a valid, unexpired token, or `null` for anything else. */
export function verifySessionToken(token: string, secret: string): string | null {
  return verifySession(token, secret)?.userId ?? null;
}

function baseCookieOptions(env: SessionEnv): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
  };
}

export function setSessionCookie(
  res: Response,
  userId: string,
  env: SessionEnv,
  passwordVersion = 0,
): void {
  res.cookie(SESSION_COOKIE, signSessionToken(userId, env.JWT_SECRET, passwordVersion), {
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
