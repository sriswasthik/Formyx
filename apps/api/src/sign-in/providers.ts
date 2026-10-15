import type { SignInError, SignInProvider } from '@formyx/shared';
import { z } from 'zod';
import type { Env } from '../config/env.js';

/*
 * Google and Zoho as OpenID Connect providers, over plain HTTPS: the authorization URL, and
 * trading the code (with its PKCE verifier) for an ID token that says who the person is.
 *
 * The ID token comes straight from the provider's token endpoint over TLS, in exchange for our
 * client secret, so its signature is not checked (OpenID Connect Core 3.1.3.7, rule 6). Its
 * issuer, audience and expiry still are, so a token meant for another app is never taken.
 */

const REQUEST_TIMEOUT_MS = 20_000;
/** Clocks drift; a token that expired a minute ago is still fine to read. */
const CLOCK_SKEW_SECONDS = 60;
const SCOPES = 'openid email profile';

export type SignInEnv = Pick<
  Env,
  | 'APP_URL'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'GOOGLE_OAUTH_URL'
  | 'GOOGLE_TOKEN_URL'
  | 'ZOHO_CLIENT_ID'
  | 'ZOHO_CLIENT_SECRET'
  | 'ZOHO_ACCOUNTS_URL'
>;

/** Who the provider says the person is. */
export interface ProviderProfile {
  provider: SignInProvider;
  /** The provider's lasting id for the account (`sub`). */
  subject: string;
  email: string;
  /** The provider has checked the email belongs to them. */
  emailVerified: boolean;
  name: string | null;
}

/** A sign-in that can't go on; `code` is what the log-in page explains. */
export class SignInFlowError extends Error {
  constructor(
    readonly code: SignInError,
    message: string = code,
  ) {
    super(message);
    this.name = 'SignInFlowError';
  }
}

/**
 * Zoho's data centres (https://accounts.zoho.com/oauth/serverinfo). People whose account lives
 * in another one come back with its address, and the code only works there.
 */
export const ZOHO_ACCOUNTS_SERVERS = [
  'https://accounts.zoho.com',
  'https://accounts.zoho.eu',
  'https://accounts.zoho.in',
  'https://accounts.zohohq.in',
  'https://accounts.zoho.com.au',
  'https://accounts.zoho.jp',
  'https://accounts.zoho.uk',
  'https://accounts.zohocloud.ca',
  'https://accounts.zoho.sa',
  'https://accounts.zoho.ae',
  'https://accounts.zoho.sg',
  'https://accounts.zoho.com.cn',
] as const;

/** Where the provider sends people back: this site, whose /api reaches the API. */
export const signInRedirectUri = (env: Pick<Env, 'APP_URL'>, provider: SignInProvider) =>
  `${env.APP_URL}/api/auth/oauth/${provider}/callback`;

export function signInConfigured(env: SignInEnv, provider: SignInProvider): boolean {
  return provider === 'google'
    ? Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
    : Boolean(env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_SECRET);
}

function client(env: SignInEnv, provider: SignInProvider) {
  return provider === 'google'
    ? { id: env.GOOGLE_CLIENT_ID ?? '', secret: env.GOOGLE_CLIENT_SECRET ?? '' }
    : { id: env.ZOHO_CLIENT_ID ?? '', secret: env.ZOHO_CLIENT_SECRET ?? '' };
}

export function signInAuthorizeUrl(
  env: SignInEnv,
  provider: SignInProvider,
  { state, codeChallenge }: { state: string; codeChallenge: string },
): string {
  const url = new URL(
    provider === 'google'
      ? `${env.GOOGLE_OAUTH_URL}/o/oauth2/v2/auth`
      : `${env.ZOHO_ACCOUNTS_URL}/oauth/v2/auth`,
  );
  url.search = new URLSearchParams({
    client_id: client(env, provider).id,
    redirect_uri: signInRedirectUri(env, provider),
    response_type: 'code',
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    // Google: let people with several accounts pick one. Zoho: no refresh token wanted.
    ...(provider === 'google' ? { prompt: 'select_account' } : { access_type: 'online' }),
  }).toString();
  return url.toString();
}

/**
 * The Zoho data centre to trade the code at: the one Zoho named, if it is one of Zoho's (or
 * the configured one); `null` for anything else, which is never sent our client secret.
 */
export function zohoAccountsServer(
  env: Pick<Env, 'ZOHO_ACCOUNTS_URL'>,
  named: string | undefined,
): string | null {
  if (!named) return env.ZOHO_ACCOUNTS_URL;
  const server = named.replace(/\/+$/, '');
  const known: readonly string[] = [...ZOHO_ACCOUNTS_SERVERS, env.ZOHO_ACCOUNTS_URL];
  return known.includes(server) ? server : null;
}

/** An issuer as a URL and as a bare host, since providers write it either way. */
function issuerForms(base: string): string[] {
  return [base, base.replace(/^https?:\/\//, '')];
}

const claimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  sub: z.string().min(1),
  email: z.string().optional(),
  // Zoho has been seen to send it as a string.
  email_verified: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  name: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});
type Claims = z.infer<typeof claimsSchema>;

function decodeClaims(idToken: string): Claims | null {
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    const parsed = claimsSchema.safeParse(
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function displayName(claims: Claims): string | null {
  const joined = (first?: string, last?: string) =>
    [first, last].filter(Boolean).join(' ').trim() || undefined;
  const name =
    claims.name?.trim() ||
    joined(claims.given_name, claims.family_name) ||
    joined(claims.first_name, claims.last_name);
  return name || null;
}

/**
 * Who signed in, from the ID token: checked to be for us, from `issuers`, and current.
 * Exported for tests.
 */
export function profileFromIdToken(
  provider: SignInProvider,
  idToken: string | undefined,
  { clientId, issuers, now = Date.now() }: { clientId: string; issuers: string[]; now?: number },
): ProviderProfile {
  const claims = idToken ? decodeClaims(idToken) : null;
  if (!claims) throw new SignInFlowError('failed', `${provider} sent no usable ID token`);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(clientId)) {
    throw new SignInFlowError('failed', `${provider} ID token is for another client`);
  }
  if (!issuers.includes(claims.iss)) {
    throw new SignInFlowError('failed', `${provider} ID token has issuer ${claims.iss}`);
  }
  if (claims.exp + CLOCK_SKEW_SECONDS < now / 1000) {
    throw new SignInFlowError('failed', `${provider} ID token has expired`);
  }
  if (!claims.email) throw new SignInFlowError('failed', `${provider} did not share an email`);
  return {
    provider,
    subject: claims.sub,
    email: claims.email,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    name: displayName(claims),
  };
}

interface TokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

/**
 * Trades the code from the provider's redirect for the person's profile. `accountsServer` is
 * Zoho's `accounts-server`, when it sent one.
 */
export async function exchangeSignInCode(
  env: SignInEnv,
  provider: SignInProvider,
  {
    code,
    codeVerifier,
    accountsServer,
  }: { code: string; codeVerifier: string; accountsServer?: string },
): Promise<ProviderProfile> {
  const { id, secret } = client(env, provider);
  let tokenUrl: string;
  let issuers: string[];
  if (provider === 'google') {
    tokenUrl = `${env.GOOGLE_TOKEN_URL}/token`;
    issuers = issuerForms(env.GOOGLE_OAUTH_URL);
  } else {
    const server = zohoAccountsServer(env, accountsServer);
    if (!server) throw new SignInFlowError('failed', `Unknown Zoho server ${accountsServer}`);
    tokenUrl = `${server}/oauth/v2/token`;
    issuers = issuerForms(server);
  }

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: signInRedirectUri(env, provider),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new SignInFlowError('failed', `Could not reach ${provider}: ${String(error)}`);
  }
  const body = (await response.json().catch(() => ({}))) as TokenResponse;
  // Zoho answers 200 with an `error` field for a bad code.
  if (!response.ok || body.error) {
    throw new SignInFlowError(
      'failed',
      `${provider} refused the code: ${body.error_description ?? body.error ?? response.status}`,
    );
  }
  return profileFromIdToken(provider, body.id_token, { clientId: id, issuers });
}
