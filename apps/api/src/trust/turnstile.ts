import type { Logger } from 'pino';
import type { Env } from '../config/env.js';

/*
 * Cloudflare Turnstile, the spam check a form can switch on: the public page shows Cloudflare's
 * widget, and a response needs the token it gives. Outside production, Cloudflare's test keys
 * (which always pass) stand in when none are set.
 */

/** Cloudflare's always-passing test keys (developers.cloudflare.com/turnstile/troubleshooting/testing). */
const TEST_KEYS = {
  siteKey: '1x00000000000000000000AA',
  secretKey: '1x0000000000000000000000000000000AA',
};

export interface TurnstileKeys {
  siteKey: string;
  secretKey: string;
}

/** The keys to use, or null when the spam check isn't available on this server. */
export function turnstileKeys(
  env: Pick<Env, 'NODE_ENV' | 'TURNSTILE_SITE_KEY' | 'TURNSTILE_SECRET_KEY'>,
): TurnstileKeys | null {
  if (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY) {
    return { siteKey: env.TURNSTILE_SITE_KEY, secretKey: env.TURNSTILE_SECRET_KEY };
  }
  return env.NODE_ENV === 'production' ? null : TEST_KEYS;
}

const VERIFY_TIMEOUT_MS = 5000;

export interface TurnstileVerifier {
  /** Whether `token` passed. A check Cloudflare can't answer counts as passed, and is logged. */
  verify(token: string | undefined, ip: string | undefined): Promise<boolean>;
}

export function createTurnstileVerifier({
  keys,
  baseUrl,
  logger,
}: {
  keys: TurnstileKeys;
  baseUrl: string;
  logger: Pick<Logger, 'warn'>;
}): TurnstileVerifier {
  return {
    async verify(token, ip) {
      if (!token) return false;
      try {
        const response = await fetch(`${baseUrl}/turnstile/v0/siteverify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            secret: keys.secretKey,
            response: token,
            ...(ip && { remoteip: ip }),
          }),
          signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
        });
        const body = (await response.json()) as { success?: unknown };
        return body.success === true;
      } catch (error) {
        // Losing real responses because Cloudflare is down would be worse than a little spam.
        logger.warn({ err: error }, 'Turnstile could not be reached; the response was let through');
        return true;
      }
    },
  };
}
