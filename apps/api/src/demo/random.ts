/**
 * A small seeded random source (mulberry32), so the demo data is the same on every reset and
 * tests can rely on it. Not for anything security-related.
 */
export interface Random {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max], both included. */
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** One item, chosen with probability proportional to its weight. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
  /** A normally distributed number (mean 0, standard deviation 1). */
  normal(): number;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  function pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(next() * items.length)];
    if (item === undefined) throw new Error('Cannot pick from an empty list');
    return item;
  }

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick,
    weighted(entries) {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let target = next() * total;
      for (const [item, weight] of entries) {
        target -= weight;
        if (target < 0) return item;
      }
      return pick(entries)[0];
    },
    normal() {
      // Box-Muller; 1 - next() keeps the logarithm away from zero.
      return Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
    },
  };
}
