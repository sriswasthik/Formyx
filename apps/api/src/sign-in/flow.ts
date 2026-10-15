import { createHash, randomBytes } from 'node:crypto';
import {
  referralCodeSchema,
  signInProviderSchema,
  signupSourceSchema,
  type SignInProvider,
} from '@formyx/shared';
import type { CookieOptions, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Env } from '../config/env.js';

/*
 * One round trip to Google or Zoho and back. Starting it makes a PKCE verifier, kept in a
 * short-lived cookie in this browser; the signed `state` carries its hash and what to do on
 * return. The callback needs both, so a code can't be redeemed in another browser, and a link
 * to our callback can't sign someone in to an account that isn't theirs (login CSRF).
 */

export const SIGN_IN_COOKIE = 'formyx_sign_in';
const ISSUER = 'formyx-sign-in';
const AUDIENCE = 'formyx-sign-in-callback';
/** Long enough to pick an account and agree, short enough to be useless later. */
const FLOW_TTL_SECONDS = 10 * 60;

const payloadSchema = z.object({
  provider: signInProviderSchema,
  /** SHA-256 of the cookie's verifier. */
  bind: z.string().min(1),
  next: z.string().optional(),
  ref: referralCodeSchema.optional(),
  source: signupSourceSchema.optional(),
  page: z.enum(['login', 'signup']),
});

export interface SignInFlow {
  provider: SignInProvider;
  /** Where to go once signed in; already checked with `isAfterSignInPath`. */
  next?: string;
  /** For a new account: the referral code and what brought them. */
  ref?: string;
  source?: z.infer<typeof signupSourceSchema>;
  /** The page they started on, to send them back to if it goes wrong. */
  page: 'login' | 'signup';
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

function cookieOptions(env: Pick<Env, 'NODE_ENV'>): CookieOptions {
  return {
    httpOnly: true,
    // Lax: sent on the top-level redirect back from the provider, not on cross-site requests.
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
  };
}

/** Starts a round trip: sets the cookie, and returns the `state` and PKCE challenge. */
export function beginSignIn(
  res: Response,
  env: Pick<Env, 'JWT_SECRET' | 'NODE_ENV'>,
  flow: SignInFlow,
): { state: string; codeChallenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  res.cookie(SIGN_IN_COOKIE, verifier, {
    ...cookieOptions(env),
    maxAge: FLOW_TTL_SECONDS * 1000,
  });
  const state = jwt.sign({ ...flow, bind: sha256(verifier) }, env.JWT_SECRET, {
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: FLOW_TTL_SECONDS,
  });
  return { state, codeChallenge: sha256(verifier) };
}

/**
 * The round trip `state` belongs to, with the PKCE verifier to redeem the code: only when the
 * state is ours, current and for `provider`, and this browser started it. Clears the cookie.
 */
export function finishSignIn(
  req: Request,
  res: Response,
  env: Pick<Env, 'JWT_SECRET' | 'NODE_ENV'>,
  { provider, state }: { provider: SignInProvider; state: string | undefined },
): { flow: SignInFlow; codeVerifier: string } | null {
  const cookies: unknown = req.cookies;
  const verifier =
    typeof cookies === 'object' && cookies !== null
      ? (cookies as Record<string, unknown>)[SIGN_IN_COOKIE]
      : undefined;
  res.clearCookie(SIGN_IN_COOKIE, cookieOptions(env));
  if (!state || typeof verifier !== 'string' || verifier === '') return null;
  try {
    const { bind, ...flow } = payloadSchema.parse(
      jwt.verify(state, env.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      }),
    );
    if (flow.provider !== provider || bind !== sha256(verifier)) return null;
    return { flow, codeVerifier: verifier };
  } catch {
    return null;
  }
}

/** The page a failed round trip lands on, before its state could be read. */
export function readFlowPage(state: string | undefined): 'login' | 'signup' {
  const decoded = state ? jwt.decode(state) : null;
  return typeof decoded === 'object' && decoded?.page === 'signup' ? 'signup' : 'login';
}
