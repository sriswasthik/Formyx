import { ApiRequestError } from '@/lib/api';

/**
 * How long to wait before each new try at sending a response: about half a minute in all,
 * long enough for a dropped connection to come back or a sleeping server to wake up.
 */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15_000] as const;

/** Whether trying again might work: the server was not reached, or failed for a moment. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false;
  return error.code === 'NETWORK_ERROR' || error.status === 408 || error.status >= 500;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Sends with `send`, trying again after each of `delays` while it fails in a way that might
 * pass. The server stores a response once per submission key, so trying again is safe even
 * when the first try got through and only its reply was lost. Other failures (the answers,
 * the form being closed) are thrown at once.
 */
export async function sendWithRetry<T>(
  send: () => Promise<T>,
  {
    onRetry,
    delays = RETRY_DELAYS_MS,
    sleep = wait,
  }: {
    /** Called before each new try, with its number (1 for the first retry). */
    onRetry?: (attempt: number) => void;
    delays?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined || !isRetryable(error)) throw error;
      onRetry?.(attempt + 1);
      await sleep(delay);
    }
  }
}

/** A new submission key: random, URL-safe, the same for every try at one response. */
export function newSubmissionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
