import { parseRefParam, type SignupSource } from '@formyx/shared';

/*
 * What brought someone to Formyx, remembered in this browser until they sign up: a friend's
 * referral code (`?ref=<code>`) or a source such as the badge on a free form (`?ref=badge`).
 * Kept for 30 days; a referral code wins over a source, and a newer code over an older one.
 */

const KEY = 'formyx:attribution';
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export interface Attribution {
  referralCode?: string;
  source?: SignupSource;
  /** When it was noted (ms since the epoch). */
  at: number;
}

function read(storage: Storage): Attribution | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Attribution>;
    return typeof parsed.at === 'number' ? (parsed as Attribution) : null;
  } catch {
    return null;
  }
}

/** Notes a `ref` link parameter, if there is one. */
export function noteAttribution(
  search: string,
  storage: Storage = localStorage,
  now: number = Date.now(),
): void {
  const ref = parseRefParam(new URLSearchParams(search).get('ref'));
  if (!ref) return;
  const current = readAttribution(storage, now);
  const next: Attribution =
    ref.kind === 'referral'
      ? { ...current, referralCode: ref.code, at: now }
      : // A source never replaces a referral code someone was given.
        { ...current, source: current?.source ?? ref.source, at: current?.at ?? now };
  try {
    storage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked or full: sign-up just won't know.
  }
}

/** What was noted, unless it is older than 30 days. */
export function readAttribution(
  storage: Storage = localStorage,
  now: number = Date.now(),
): Attribution | null {
  const found = read(storage);
  return found && now - found.at <= KEEP_MS ? found : null;
}

/** Forgets it, once the account is made. */
export function clearAttribution(storage: Storage = localStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
