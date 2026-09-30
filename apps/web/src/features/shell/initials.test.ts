import { describe, expect, it } from 'vitest';
import { getInitials } from './initials';

describe('getInitials', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['grace', 'G'],
    ['  Mary  Jane   Watson ', 'MW'],
    ['Émile Zola', 'ÉZ'],
    ['李雷', '李'],
    ['', '?'],
    ['   ', '?'],
  ])('%j -> %j', (name, expected) => {
    expect(getInitials(name)).toBe(expected);
  });
});
