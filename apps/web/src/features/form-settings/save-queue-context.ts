import { createContext, useContext } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** How long typing pauses before it saves. */
export const TYPING_DELAY_MS = 600;

export interface SaveQueue {
  status: SaveStatus;
  /** What went wrong with the last save, for the status line. */
  error: string | null;
  /** Saves `key`'s change now, after the ones before it. A later one for the same key wins. */
  save: (key: string, run: () => Promise<unknown>) => void;
  /** Saves `key`'s change once typing pauses. */
  saveSoon: (key: string, run: () => Promise<unknown>) => void;
  /** Tries the last failed save again. */
  retry: () => void;
}

export const SaveQueueContext = createContext<SaveQueue | null>(null);

export function useSaveQueue(): SaveQueue {
  const queue = useContext(SaveQueueContext);
  if (!queue) throw new Error('useSaveQueue needs a SaveQueueProvider');
  return queue;
}
