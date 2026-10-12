import type { MotionPreference } from '@formyx/shared';
import { create } from 'zustand';

/*
 * How much the app moves. `system` follows the device's setting; `reduce` and `full` override
 * it. It is written on <html> as `data-motion`, which the `motion-safe` and `motion-reduce`
 * variants and the global reduced-motion rule read (see index.css), and passed to motion's
 * MotionConfig, so CSS and JS animations agree.
 */

/** Keep in sync with the inline script in index.html. */
export const MOTION_STORAGE_KEY = 'formyx-motion';

export function parseMotionPreference(value: unknown): MotionPreference {
  return value === 'reduce' || value === 'full' ? value : 'system';
}

function readStored(): MotionPreference {
  try {
    return parseMotionPreference(window.localStorage.getItem(MOTION_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function applyMotionPreference(
  preference: MotionPreference,
  root: HTMLElement = document.documentElement,
): void {
  if (preference === 'system') delete root.dataset.motion;
  else root.dataset.motion = preference;
}

interface MotionState {
  preference: MotionPreference;
  setPreference: (preference: MotionPreference) => void;
}

export const useMotionStore = create<MotionState>()((set) => ({
  preference: readStored(),
  setPreference: (preference) => {
    try {
      window.localStorage.setItem(MOTION_STORAGE_KEY, preference);
    } catch {
      // Not persisting is acceptable; it still applies for this visit.
    }
    applyMotionPreference(preference);
    set({ preference });
  },
}));

/** motion's `reducedMotion` setting for a preference. */
export const MOTION_CONFIG: Record<MotionPreference, 'user' | 'always' | 'never'> = {
  system: 'user',
  reduce: 'always',
  full: 'never',
};
