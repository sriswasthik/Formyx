import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './events.js';

const event = { formId: 'form_1', ids: ['sub_1'] };

function capturingLogger() {
  const lines: { msg: string; event?: string }[] = [];
  const logger = pino(
    { level: 'error' },
    {
      write: (line: string) => {
        lines.push(JSON.parse(line) as { msg: string; event?: string });
      },
    },
  );
  return { logger, lines };
}

describe('createEventBus', () => {
  it('calls listeners after the emitter has moved on', async () => {
    const bus = createEventBus(capturingLogger().logger);
    const listener = vi.fn();
    bus.on('submissions.deleted', listener);

    bus.emit('submissions.deleted', event);
    expect(listener).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith(event);
    });
  });

  it('logs listeners that throw or reject, and still calls the others', async () => {
    const { logger, lines } = capturingLogger();
    const bus = createEventBus(logger);
    const healthy = vi.fn();
    bus.on('submissions.deleted', () => {
      throw new Error('sync failure');
    });
    bus.on('submissions.deleted', () => Promise.reject(new Error('async failure')));
    bus.on('submissions.deleted', healthy);

    expect(() => {
      bus.emit('submissions.deleted', event);
    }).not.toThrow();

    await vi.waitFor(() => {
      expect(lines).toHaveLength(2);
    });
    expect(healthy).toHaveBeenCalledOnce();
    expect(lines.every((line) => line.event === 'submissions.deleted')).toBe(true);
  });

  it('stops calling a listener once it is removed', async () => {
    const bus = createEventBus(capturingLogger().logger);
    const removed = vi.fn();
    const kept = vi.fn();
    const off = bus.on('submissions.deleted', removed);
    bus.on('submissions.deleted', kept);

    off();
    bus.emit('submissions.deleted', event);

    await vi.waitFor(() => {
      expect(kept).toHaveBeenCalledOnce();
    });
    expect(removed).not.toHaveBeenCalled();
  });
});
