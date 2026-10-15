import { isIP } from 'node:net';
import type { Env } from '../config/env.js';
import type { Logger } from 'pino';

/*
 * Whether an address is safe to send people to: links in forms when they are published, and
 * webhook addresses when they are saved. A built-in blocklist always applies; Google Safe
 * Browsing too, when GOOGLE_SAFE_BROWSING_KEY is set.
 */

export interface UnsafeLink {
  url: string;
  /** Why, for the creator and the reviewer: "is a link shortener, which hides where it goes". */
  reason: string;
}

export interface LinkCheckOptions {
  /**
   * Addresses that are bare IPs are fine: for webhooks, which servers call. Links people
   * click never need one, and phishing often uses them.
   */
  allowIpAddresses?: boolean;
}

export interface LinkChecker {
  /** The unsafe ones among `urls`; an empty list when all are fine. */
  check(urls: readonly string[], options?: LinkCheckOptions): Promise<UnsafeLink[]>;
}

/** Link shorteners: they hide where a link really goes, which is what phishing relies on. */
const SHORTENERS = [
  'bit.ly',
  'bitly.com',
  'tinyurl.com',
  'is.gd',
  'v.gd',
  'cutt.ly',
  't.ly',
  'rb.gy',
  'shorturl.at',
  'ow.ly',
  'tiny.cc',
  'buff.ly',
  'rebrand.ly',
  'shorte.st',
  'adf.ly',
  'goo.su',
  'clck.ru',
  'u.to',
  'qr.ae',
  's.id',
];

/** Whether `host` is `domain` or one of its subdomains. */
function isWithin(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Why the blocklist refuses `url`, or null. Addresses that don't parse are left to others. */
export function blocklistReason(
  url: string,
  blockedDomains: readonly string[] = [],
  { allowIpAddresses = false }: LinkCheckOptions = {},
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password) {
    return 'hides its real address behind a user name';
  }
  const host = parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (isIP(host)) return allowIpAddresses ? null : 'points at a bare IP address';
  if (SHORTENERS.some((domain) => isWithin(host, domain))) {
    return 'is a link shortener, which hides where it goes';
  }
  if (blockedDomains.some((domain) => isWithin(host, domain))) {
    return 'is on Formyx’s list of unsafe sites';
  }
  return null;
}

const THREAT_REASONS: Record<string, string> = {
  SOCIAL_ENGINEERING: 'is a known phishing site',
  MALWARE: 'spreads malware',
  UNWANTED_SOFTWARE: 'spreads unwanted software',
  POTENTIALLY_HARMFUL_APPLICATION: 'spreads harmful apps',
};

const SAFE_BROWSING_TIMEOUT_MS = 5000;
/** Safe Browsing takes at most 500 addresses a request. */
const SAFE_BROWSING_BATCH = 500;

interface SafeBrowsingResponse {
  matches?: { threatType?: string; threat?: { url?: string } }[];
}

/**
 * Google Safe Browsing (Lookup API v4). If Google can't be reached, nothing is reported unsafe
 * (and it is logged): publishing doesn't stop because a lookup failed.
 */
export function createSafeBrowsingChecker({
  key,
  baseUrl,
  logger,
}: {
  key: string;
  baseUrl: string;
  logger: Pick<Logger, 'warn'>;
}): LinkChecker {
  return {
    async check(urls) {
      const unsafe: UnsafeLink[] = [];
      for (let start = 0; start < urls.length; start += SAFE_BROWSING_BATCH) {
        const batch = urls.slice(start, start + SAFE_BROWSING_BATCH);
        try {
          const response = await fetch(
            `${baseUrl}/v4/threatMatches:find?key=${encodeURIComponent(key)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client: { clientId: 'formyx', clientVersion: '1.0' },
                threatInfo: {
                  threatTypes: Object.keys(THREAT_REASONS),
                  platformTypes: ['ANY_PLATFORM'],
                  threatEntryTypes: ['URL'],
                  threatEntries: batch.map((url) => ({ url })),
                },
              }),
              signal: AbortSignal.timeout(SAFE_BROWSING_TIMEOUT_MS),
            },
          );
          if (!response.ok) throw new Error(`Safe Browsing answered ${String(response.status)}`);
          const body = (await response.json()) as SafeBrowsingResponse;
          for (const match of body.matches ?? []) {
            const url = match.threat?.url;
            if (!url || unsafe.some((known) => known.url === url)) continue;
            unsafe.push({
              url,
              reason:
                THREAT_REASONS[match.threatType ?? ''] ?? 'is flagged by Google Safe Browsing',
            });
          }
        } catch (error) {
          logger.warn({ err: error, count: batch.length }, 'Safe Browsing lookup failed');
        }
      }
      return unsafe;
    },
  };
}

/** The blocklist, then Safe Browsing for what it let through (when a key is set). */
export function createLinkChecker(
  env: Pick<Env, 'BLOCKED_LINK_DOMAINS' | 'GOOGLE_SAFE_BROWSING_KEY' | 'SAFE_BROWSING_URL'>,
  logger: Pick<Logger, 'warn'>,
): LinkChecker {
  const safeBrowsing = env.GOOGLE_SAFE_BROWSING_KEY
    ? createSafeBrowsingChecker({
        key: env.GOOGLE_SAFE_BROWSING_KEY,
        baseUrl: env.SAFE_BROWSING_URL,
        logger,
      })
    : null;
  return {
    async check(urls, options = {}) {
      const unique = [...new Set(urls)];
      const blocked: UnsafeLink[] = [];
      const rest: string[] = [];
      for (const url of unique) {
        const reason = blocklistReason(url, env.BLOCKED_LINK_DOMAINS, options);
        if (reason) blocked.push({ url, reason });
        else rest.push(url);
      }
      const flagged = safeBrowsing && rest.length > 0 ? await safeBrowsing.check(rest) : [];
      return [...blocked, ...flagged];
    },
  };
}
