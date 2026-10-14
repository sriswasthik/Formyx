import { useSyncExternalStore } from 'react';

/*
 * The newest changelog entry's id, kept apart from the entries so the app shell can show
 * "What's new" without loading them. changelog.test.ts checks the two agree.
 */
export const LATEST_CHANGELOG_ID = '2026-10-brand';

const STORAGE_KEY = 'formyx-changelog-seen';
const listeners = new Set<() => void>();

function readSeen(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Remembers, in this browser, that the newest entry has been seen. */
export function markChangelogSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, LATEST_CHANGELOG_ID);
  } catch {
    // Private windows and blocked storage: the dot simply stays.
  }
  for (const listener of listeners) listener();
}

/** Whether something shipped since this browser last opened the changelog. */
export function useHasUnseenChanges(): boolean {
  const seen = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readSeen,
    () => LATEST_CHANGELOG_ID,
  );
  return seen !== LATEST_CHANGELOG_ID;
}
