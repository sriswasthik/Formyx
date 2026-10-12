import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveQueueProvider } from './save-queue';
import { TYPING_DELAY_MS, useSaveQueue, type SaveQueue } from './save-queue-context';

let queue: SaveQueue;

/** Shows the queue's status, and hands the queue to the test. */
function Probe() {
  const current = useSaveQueue();
  useEffect(() => {
    queue = current;
  });
  return (
    <p>
      {current.status}
      {current.error ? `: ${current.error}` : ''}
    </p>
  );
}

function renderQueue() {
  render(
    <SaveQueueProvider
      describeError={(error) => (error instanceof Error ? error.message : 'failed')}
    >
      <Probe />
    </SaveQueueProvider>,
  );
}

/** A save that finishes when told to. */
function deferred() {
  let finish: () => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  return { run: vi.fn(() => promise), finish, fail };
}

const flush = () => act(async () => {});

describe('SaveQueueProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs saves one at a time, in order, then says they are saved', async () => {
    renderQueue();
    const first = deferred();
    const second = deferred();

    act(() => {
      queue.save('a', first.run);
      queue.save('b', second.run);
    });
    expect(screen.getByText('saving')).toBeInTheDocument();
    await flush();
    expect(first.run).toHaveBeenCalledOnce();
    expect(second.run).not.toHaveBeenCalled();

    first.finish();
    await flush();
    expect(second.run).toHaveBeenCalledOnce();
    expect(screen.getByText('saving')).toBeInTheDocument();

    second.finish();
    await flush();
    expect(screen.getByText('saved')).toBeInTheDocument();
  });

  it('sends only the latest change to a setting that changed again while waiting', async () => {
    renderQueue();
    const blocker = deferred();
    const older = vi.fn(() => Promise.resolve());
    const newer = vi.fn(() => Promise.resolve());

    act(() => {
      queue.save('other', blocker.run);
      queue.save('title', older);
      queue.save('title', newer);
    });
    blocker.finish();
    await flush();

    expect(older).not.toHaveBeenCalled();
    expect(newer).toHaveBeenCalledOnce();
    expect(screen.getByText('saved')).toBeInTheDocument();
  });

  it('waits for typing to pause', async () => {
    renderQueue();
    const run = vi.fn(() => Promise.resolve());

    act(() => {
      queue.saveSoon('title', run);
    });
    act(() => {
      vi.advanceTimersByTime(TYPING_DELAY_MS - 100);
      queue.saveSoon('title', run);
    });
    act(() => {
      vi.advanceTimersByTime(TYPING_DELAY_MS - 100);
    });
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByText('saving')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    await flush();
    expect(run).toHaveBeenCalledOnce();
    expect(screen.getByText('saved')).toBeInTheDocument();
  });

  it('says what went wrong, and tries the failed save again', async () => {
    renderQueue();
    const run = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(undefined);

    act(() => {
      queue.save('password', run);
    });
    await flush();
    expect(screen.getByText('error: Offline')).toBeInTheDocument();

    act(() => {
      queue.retry();
    });
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
    expect(screen.getByText('saved')).toBeInTheDocument();
  });
});
