/** Keep in sync with the inline script in index.html. */
export const THEME_STORAGE_KEY = 'formyx-theme';
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export function readStoredPreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Storage can be unavailable (privacy mode, blocked cookies).
    return 'system';
  }
}

export function writeStoredPreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not persisting is acceptable; the choice still applies for this session.
  }
}

/** Applies a theme to <html> without animating every colour transition on the page. */
export function applyTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement) {
  const isDark = theme === 'dark';
  if (root.classList.contains('dark') === isDark && root.style.colorScheme === theme) return;

  root.classList.add('theme-switching');
  root.classList.toggle('dark', isDark);
  root.style.colorScheme = theme;
  // Reading a computed style flushes the change while transitions are disabled.
  window.getComputedStyle(root).getPropertyValue('color');
  window.setTimeout(() => {
    root.classList.remove('theme-switching');
  }, 1);
}
