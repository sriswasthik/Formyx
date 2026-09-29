import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('keeps a custom font size alongside a text colour', () => {
    expect(cn('text-14 text-muted-foreground')).toBe('text-14 text-muted-foreground');
  });

  it('lets the last custom font size win', () => {
    expect(cn('text-14', 'text-16')).toBe('text-16');
  });

  it('merges custom shadows and easings', () => {
    expect(cn('shadow-popover', 'shadow-dialog')).toBe('shadow-dialog');
    expect(cn('ease-standard', 'ease-linear')).toBe('ease-linear');
  });

  it('drops falsy values', () => {
    expect(cn('px-2', false, undefined, null, 'py-1')).toBe('px-2 py-1');
  });
});
