import { useCallback, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import { SaveQueueContext, TYPING_DELAY_MS, type SaveStatus } from './save-queue-context';

/*
 * Settings save as they change: toggles and choices at once, typing a moment after it pauses.
 * Saves run one at a time, in order, so a form's version moves forward cleanly and a later
 * change never lands before an earlier one. The page shows one status for them all.
 */

/** Why a save failed, in a few words. */
export type DescribeError = (error: unknown) => string;

export function SaveQueueProvider({
  describeError,
  children,
}: {
  describeError: DescribeError;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef(new Map<string, number>());
  const failed = useRef<{ key: string; run: () => Promise<unknown> } | null>(null);

  const save = useCallback(
    (key: string, run: () => Promise<unknown>) => {
      const timer = timers.current.get(key);
      if (timer) clearTimeout(timer);
      timers.current.delete(key);
      const ticket = (latest.current.get(key) ?? 0) + 1;
      latest.current.set(key, ticket);
      pending.current += 1;
      setStatus('saving');
      setError(null);
      chain.current = chain.current.then(async () => {
        try {
          // A newer change to the same setting replaces this one before it is sent.
          if (latest.current.get(key) === ticket) await run();
          failed.current = null;
        } catch (cause) {
          failed.current = { key, run };
          setError(describeError(cause));
        } finally {
          pending.current -= 1;
          if (pending.current === 0) setStatus(failed.current ? 'error' : 'saved');
        }
      });
    },
    [describeError],
  );

  const saveSoon = useCallback(
    (key: string, run: () => Promise<unknown>) => {
      const timer = timers.current.get(key);
      if (timer) clearTimeout(timer);
      setStatus('saving');
      timers.current.set(
        key,
        setTimeout(() => {
          save(key, run);
        }, TYPING_DELAY_MS),
      );
    },
    [save],
  );

  const retry = useCallback(() => {
    const last = failed.current;
    if (last) save(last.key, last.run);
  }, [save]);

  const value = useMemo(
    () => ({ status, error, save, saveSoon, retry }),
    [status, error, save, saveSoon, retry],
  );
  return <SaveQueueContext.Provider value={value}>{children}</SaveQueueContext.Provider>;
}
