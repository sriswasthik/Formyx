import { useSyncExternalStore } from 'react';

/** Whether `query` matches, kept up to date as the window changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => {
        media.removeEventListener('change', onChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
