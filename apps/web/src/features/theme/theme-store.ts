import { useEffect } from 'react';
import { create } from 'zustand';
import { isEmbedded } from '@/lib/embed';
import {
  applyTheme,
  DARK_MEDIA_QUERY,
  parseThemePreference,
  readStoredPreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeStoredPreference,
  type ThemePreference,
} from './theme';

interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  preference: readStoredPreference(),
  setPreference: (preference) => {
    writeStoredPreference(preference);
    set({ preference });
  },
}));

/** Keeps <html> in sync with the stored preference, the OS setting and other tabs. */
export function useThemeSync() {
  const preference = useThemeStore((state) => state.preference);

  useEffect(() => {
    // Embedded forms take their colours from the form, never from the app's theme.
    if (isEmbedded()) return;
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const update = () => {
      applyTheme(resolveTheme(preference, media.matches));
    };
    update();
    if (preference !== 'system') return;
    media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
    };
  }, [preference]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      useThemeStore.setState({ preference: parseThemePreference(event.newValue) });
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);
}
