import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  parseThemePreference,
  readStoredPreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeStoredPreference,
} from './theme';

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
});

describe('parseThemePreference', () => {
  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'system'],
    [null, 'system'],
    ['purple', 'system'],
    [42, 'system'],
  ])('parses %j as %s', (input, expected) => {
    expect(parseThemePreference(input)).toBe(expected);
  });
});

describe('resolveTheme', () => {
  it('uses explicit preferences as-is', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the OS for system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('stored preference', () => {
  it('round-trips through localStorage', () => {
    writeStoredPreference('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readStoredPreference()).toBe('dark');
  });

  it('falls back to system when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readStoredPreference()).toBe('system');
  });
});

describe('applyTheme', () => {
  it('toggles the dark class and color-scheme on the root element', () => {
    applyTheme('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    applyTheme('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('disables transitions only briefly while switching', () => {
    vi.useFakeTimers();
    applyTheme('dark');
    expect(document.documentElement).toHaveClass('theme-switching');
    vi.runAllTimers();
    expect(document.documentElement).not.toHaveClass('theme-switching');
    vi.useRealTimers();
  });
});
