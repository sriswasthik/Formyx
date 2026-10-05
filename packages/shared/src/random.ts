/** The largest seed: seeds are 31-bit non-negative integers, so they fit JSON and Postgres. */
export const MAX_SEED = 2_147_483_647;

export interface Random {
  /** A number from 0 (included) to 1 (excluded). */
  next(): number;
  /** A number from `min` to `max`. */
  between(min: number, max: number): number;
  /** An integer from `min` to `max`, both included. */
  int(min: number, max: number): number;
  /** One of `items`, which must not be empty. */
  pick<T>(items: readonly T[]): T;
}

/**
 * A small, fast generator (mulberry32) that always gives the same numbers for the same seed,
 * so anything generated from a saved seed looks the same on every device and every visit.
 */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    next,
    between: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error('Nothing to pick from');
      return item;
    },
  };
}

/** A fresh seed, for "Shuffle" and "Scatter". Not for anything secret. */
export function randomSeed(): number {
  return Math.floor(Math.random() * MAX_SEED);
}

/** Rounds to one decimal place, which keeps generated paths and positions short. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
