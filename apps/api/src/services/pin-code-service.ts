import { PIN_CODE_PATTERN, type PinCodeLookup } from '@formyx/shared';
import type { Logger } from 'pino';

/*
 * Indian PIN codes to their city and state, for address questions. India Post's public API
 * answers them; it is free but slow at times, so answers are cached here (and by browsers),
 * and a lookup that fails just leaves respondents to type city and state themselves.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** PIN codes change rarely. */
const FOUND_TTL_MS = 30 * DAY_MS;
/** A PIN code that is not in use might be soon, and a wrong one is often a typo. */
const NOT_FOUND_TTL_MS = DAY_MS;
const MAX_ENTRIES = 5000;
const TIMEOUT_MS = 4000;

interface IndiaPostOffice {
  Name?: unknown;
  District?: unknown;
  State?: unknown;
}

interface CacheEntry {
  value: PinCodeLookup | null;
  expiresAt: number;
}

export interface PinCodeService {
  /**
   * The city and state of a PIN code; `null` if India Post does not know it. Throws if the
   * lookup could not be made (so it is not cached as unknown).
   */
  lookup(pin: string): Promise<PinCodeLookup | null>;
}

interface PinCodeOptions {
  baseUrl: string;
  logger: Logger;
  fetch?: typeof fetch;
  now?: () => number;
  maxEntries?: number;
}

/** The district, as people name their city, and the state, from India Post's answer. */
function fromIndiaPost(pin: string, body: unknown): PinCodeLookup | null {
  const [result] = Array.isArray(body) ? (body as unknown[]) : [];
  if (typeof result !== 'object' || result === null) return null;
  const { Status, PostOffice } = result as { Status?: unknown; PostOffice?: unknown };
  if (Status !== 'Success' || !Array.isArray(PostOffice)) return null;
  const office = (PostOffice as IndiaPostOffice[]).find(
    (candidate) => typeof candidate.District === 'string' && typeof candidate.State === 'string',
  );
  if (!office) return null;
  return { pin, city: String(office.District).trim(), state: String(office.State).trim() };
}

export function createPinCodeService({
  baseUrl,
  logger,
  // Looked up on each call, so the global fetch can be swapped (tests).
  fetch: fetchImpl = (input, init) => fetch(input, init),
  now = Date.now,
  maxEntries = MAX_ENTRIES,
}: PinCodeOptions): PinCodeService {
  // A Map keeps insertion order: re-inserting on a hit makes it a small LRU cache.
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<PinCodeLookup | null>>();

  function remember(pin: string, value: PinCodeLookup | null) {
    cache.delete(pin);
    cache.set(pin, { value, expiresAt: now() + (value ? FOUND_TTL_MS : NOT_FOUND_TTL_MS) });
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  async function fetchPin(pin: string): Promise<PinCodeLookup | null> {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/${pin}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`India Post answered ${res.status}`);
    return fromIndiaPost(pin, await res.json());
  }

  return {
    async lookup(pin) {
      if (!PIN_CODE_PATTERN.test(pin)) return null;
      const cached = cache.get(pin);
      if (cached && cached.expiresAt > now()) {
        cache.delete(pin);
        cache.set(pin, cached);
        return cached.value;
      }
      // Several respondents typing the same PIN at once share one request.
      let pending = inFlight.get(pin);
      if (!pending) {
        pending = fetchPin(pin)
          .then((value) => {
            remember(pin, value);
            return value;
          })
          .catch((error: unknown) => {
            logger.warn({ err: error, pin }, 'PIN code lookup failed');
            throw error;
          })
          .finally(() => {
            inFlight.delete(pin);
          });
        inFlight.set(pin, pending);
      }
      return pending;
    },
  };
}
