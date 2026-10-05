import { createDefaultTheme } from '@formyx/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { themeFontsReady } from './fonts';

const theme = {
  ...createDefaultTheme(),
  typography: { ...createDefaultTheme().typography, headingFont: 'fraunces', bodyFont: 'dm-sans' },
} as const;

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'fonts');
});

describe('themeFontsReady', () => {
  it('waits for the heading and body font files', async () => {
    const load = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true });

    await themeFontsReady(theme, 5000);

    expect(load).toHaveBeenCalledWith("600 1em 'Fraunces Variable'");
    expect(load).toHaveBeenCalledWith("400 1em 'DM Sans Variable'");
  });

  it('gives up after the timeout, so a slow connection still sees the form', async () => {
    vi.useFakeTimers();
    const load = vi.fn(() => new Promise<never>(() => undefined));
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true });

    let done = false;
    const ready = themeFontsReady(theme, 1200).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(1199);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await ready;
    expect(done).toBe(true);
  });
});
