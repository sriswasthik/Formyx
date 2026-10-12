import { EDIT_TOKEN_PATTERN, FORM_ACCESS_HEADER } from '@formyx/shared';

/*
 * What a browser keeps about its access to one form. Storage can be off or full (private
 * windows, blocked site data); then nothing is kept, and the form asks again.
 *
 * - The token from unlocking a password-protected form: this tab only (sessionStorage), and
 *   read by the inline script in index.html too, which asks for the form before the app runs.
 * - The address confirmed with an emailed code, with its token: this tab only.
 * - That this browser responded, for forms taking one response per browser: kept.
 */

const accessKey = (slug: string) => `formyx:access:${slug}`;
const verifiedKey = (slug: string) => `formyx:verified:${slug}`;
const respondedKey = (slug: string) => `formyx:responded:${slug}`;

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Not kept: the form asks again.
  }
}

const session = () => window.sessionStorage;
const local = () => window.localStorage;

export function readAccessToken(slug: string): string | null {
  return read(session, accessKey(slug));
}

export function storeAccessToken(slug: string, token: string | null): void {
  write(session, accessKey(slug), token);
}

/** The header that carries the unlock token, when this tab has one for `slug`. */
export function accessHeaders(slug: string): Record<string, string> {
  const token = readAccessToken(slug);
  return token ? { [FORM_ACCESS_HEADER]: token } : {};
}

export interface VerifiedEmail {
  email: string;
  token: string;
}

export function readVerifiedEmail(slug: string): VerifiedEmail | null {
  const raw = read(session, verifiedKey(slug));
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'email' in value &&
      'token' in value &&
      typeof value.email === 'string' &&
      typeof value.token === 'string'
    ) {
      return { email: value.email, token: value.token };
    }
  } catch {
    // Unreadable: asked for again.
  }
  return null;
}

export function storeVerifiedEmail(slug: string, verified: VerifiedEmail | null): void {
  write(session, verifiedKey(slug), verified && JSON.stringify(verified));
}

export function hasResponded(slug: string): boolean {
  return read(local, respondedKey(slug)) !== null;
}

export function markResponded(slug: string): void {
  write(local, respondedKey(slug), new Date().toISOString());
}

/**
 * The token of a link to change a response, from the page's fragment (where it never reaches
 * a server). Only reads it; the page clears it from the address bar once read.
 */
export function readEditToken(): string | null {
  const match = /(?:^#|&)edit=([^&]+)/.exec(window.location.hash);
  const token = match?.[1] ? decodeURIComponent(match[1]) : null;
  return token && EDIT_TOKEN_PATTERN.test(token) ? token : null;
}

/** The link to change a response, to keep. */
export function editLink(slug: string, token: string): string {
  return `${window.location.origin}/f/${encodeURIComponent(slug)}#edit=${token}`;
}
