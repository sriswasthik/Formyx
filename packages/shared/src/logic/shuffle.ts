/*
 * Shuffling questions within a page and the options of a question, the same way every time
 * for one respondent: the order comes from their seed (kept with their saved progress), so
 * a reload or a resumed response never reshuffles what they already saw.
 */

/** A 32-bit hash of `text` (FNV-1a). */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** Mulberry32: a small, fast, seeded random number generator, 0 ≤ n < 1. */
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

/** A new seed for a respondent. */
export function createShuffleSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36);
}

/**
 * `items` in an order that depends only on `seed` and `key` (what is being shuffled, such
 * as a question id), so each list gets its own order for the same respondent.
 */
export function seededShuffle<T>(items: readonly T[], seed: string, key: string): T[] {
  const random = generator(hash(`${seed}:${key}`));
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap] as T, result[index] as T];
  }
  return result;
}

/** Options in the respondent's order; with `keepLast`, the last stays last ("Other"). */
export function shuffleOptions<T>(
  options: readonly T[],
  seed: string,
  fieldId: string,
  keepLast = false,
): T[] {
  if (!keepLast || options.length < 2) return seededShuffle(options, seed, fieldId);
  return [...seededShuffle(options.slice(0, -1), seed, fieldId), options.at(-1) as T];
}
