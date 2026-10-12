import { describe, expect, it, vi } from 'vitest';
import { cx } from './cx';
import type * as CxModule from './cx';

describe('cx', () => {
  it('joins classes as clsx does, without resolving conflicts', async () => {
    const actual = await vi.importActual<typeof CxModule>('./cx');
    expect(actual.cx('px-2', false, ['py-1', { 'text-14': true, hidden: false }])).toBe(
      'px-2 py-1 text-14',
    );
    expect(actual.cx('px-2', 'px-4')).toBe('px-2 px-4');
  });

  it('refuses conflicting classes in tests, and allows an explicit override', () => {
    expect(() => cx('h-11', 'h-9')).toThrow(/conflicting classes \[h-11\]/);
    expect(cx('h-11', 'h-9!')).toBe('h-11 h-9!');
  });
});
