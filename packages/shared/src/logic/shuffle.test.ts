import { describe, expect, it } from 'vitest';
import { createShuffleSeed, seededShuffle, shuffleOptions } from './shuffle.js';

const items = Array.from({ length: 12 }, (_, index) => index);

describe('seededShuffle', () => {
  it('keeps every item, and shuffles the same way for the same seed and key', () => {
    const once = seededShuffle(items, 'seed-a', 'q1');
    expect([...once].sort((a, b) => a - b)).toEqual(items);
    expect(seededShuffle(items, 'seed-a', 'q1')).toEqual(once);
    expect(once).not.toEqual(items);
  });

  it('gives other respondents and other lists their own order', () => {
    const base = seededShuffle(items, 'seed-a', 'q1');
    expect(seededShuffle(items, 'seed-b', 'q1')).not.toEqual(base);
    expect(seededShuffle(items, 'seed-a', 'q2')).not.toEqual(base);
  });

  it('leaves the list it was given alone', () => {
    const copy = [...items];
    seededShuffle(copy, 'seed', 'key');
    expect(copy).toEqual(items);
  });

  it('puts every item first about as often across respondents', () => {
    const firsts = new Map<number, number>();
    for (let respondent = 0; respondent < 3000; respondent++) {
      const first = seededShuffle([0, 1, 2], `r${respondent}`, 'q')[0] ?? -1;
      firsts.set(first, (firsts.get(first) ?? 0) + 1);
    }
    for (const count of firsts.values()) expect(count).toBeGreaterThan(850);
  });
});

describe('shuffleOptions', () => {
  it('can keep the last option last, as for "Other"', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      expect(shuffleOptions(items, seed, 'q', true).at(-1)).toBe(11);
    }
  });

  it('makes seeds that differ', () => {
    expect(createShuffleSeed()).not.toBe(createShuffleSeed());
  });
});
