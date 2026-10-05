import { createDefaultTheme, fontStack } from '@formyx/shared';
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

describe('addFallbackFace', () => {
  it('adds a font’s resized local fallback once, under the name its stack uses', async () => {
    const faces: { family: string; source: string; descriptors: Record<string, string> }[] = [];
    vi.stubGlobal(
      'FontFace',
      vi.fn(function FontFace(family: string, source: string, descriptors: Record<string, string>) {
        faces.push({ family, source, descriptors });
      }),
    );
    const add = vi.fn();
    Object.defineProperty(document, 'fonts', { value: { add }, configurable: true });
    const { addFallbackFace } = await import('./font-fallbacks');

    addFallbackFace('dm-sans');
    addFallbackFace('dm-sans');
    addFallbackFace('inter');

    expect(add).toHaveBeenCalledTimes(1);
    expect(faces).toEqual([
      {
        family: 'DM Sans Fallback',
        source: "local('Arial')",
        descriptors: {
          sizeAdjust: '103.57%',
          ascentOverride: '95.58%',
          descentOverride: '29.93%',
          lineGapOverride: '0%',
        },
      },
    ]);
    expect(fontStack('dm-sans')).toMatch(/^'DM Sans Variable', 'DM Sans Fallback', /);
    vi.unstubAllGlobals();
  });
});
