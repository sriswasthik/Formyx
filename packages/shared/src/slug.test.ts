import { describe, expect, it } from 'vitest';
import { slugify } from './slug.js';

describe('slugify', () => {
  it.each([
    ['Ada Lovelace', 'ada-lovelace'],
    ["Ada's workspace", 'ada-s-workspace'],
    ['  Customer   Feedback!! ', 'customer-feedback'],
    ['Ünïcode Crème Brûlée', 'unicode-creme-brulee'],
    ['Q3 2026 / Survey', 'q3-2026-survey'],
    ['---', ''],
    ['李雷', ''],
  ])('%j -> %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('caps the length without leaving a trailing dash', () => {
    expect(slugify('abc def ghi', 4)).toBe('abc');
    expect(slugify('a'.repeat(100))).toHaveLength(48);
  });
});
