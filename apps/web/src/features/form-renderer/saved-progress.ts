import type { AnswerValue } from '@formyx/shared';
import { useEffect, useRef } from 'react';

/*
 * Answers kept in the respondent's own browser as they go, so a closed tab or a reload never
 * loses them. They stay on the device: the server only sees them on submit (or when the
 * respondent emails themselves a link). Storage can be off or full; then nothing is kept.
 */

export interface SavedProgress {
  version: 1;
  answers: Record<string, AnswerValue>;
  pageKey?: string | undefined;
  seed: string;
  savedAt: number;
}

/** Saved answers are dropped after this long, as drafts saved by email are. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Typing saves once it pauses for this long. */
const SAVE_DELAY_MS = 400;

const storageKey = (key: string) => `formyx:progress:${key}`;

function isSavedProgress(value: unknown): value is SavedProgress {
  if (typeof value !== 'object' || value === null) return false;
  const saved = value as Record<string, unknown>;
  return (
    saved.version === 1 &&
    typeof saved.answers === 'object' &&
    saved.answers !== null &&
    typeof saved.seed === 'string' &&
    typeof saved.savedAt === 'number'
  );
}

/** What was saved for `key`, if anything recent with answers in it. */
export function readSavedProgress(key: string, now = Date.now()): SavedProgress | null {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (!isSavedProgress(saved) || now - saved.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(storageKey(key));
      return null;
    }
    return Object.keys(saved.answers).length > 0 ? saved : null;
  } catch {
    return null;
  }
}

export function clearSavedProgress(key: string): void {
  try {
    localStorage.removeItem(storageKey(key));
  } catch {
    // Nothing was kept.
  }
}

function writeSavedProgress(key: string, progress: Omit<SavedProgress, 'version' | 'savedAt'>) {
  try {
    localStorage.setItem(
      storageKey(key),
      JSON.stringify({ version: 1, ...progress, savedAt: Date.now() } satisfies SavedProgress),
    );
  } catch {
    // Full or off: the form works without it.
  }
}

/** Keeps `progress` saved under `key` while `key` is set, a moment after each change. */
export function useSavedProgress(
  key: string | null,
  progress: Omit<SavedProgress, 'version' | 'savedAt'>,
): void {
  const latest = useRef(progress);
  useEffect(() => {
    latest.current = progress;
  });
  const { answers, pageKey, seed } = progress;
  useEffect(() => {
    if (key === null || Object.keys(answers).length === 0) return;
    const timer = setTimeout(() => {
      writeSavedProgress(key, latest.current);
    }, SAVE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [key, answers, pageKey, seed]);
}
