import { getFont, nearestFontWeight, type FontId, type FormTheme } from '@formyx/shared';
import { useEffect } from 'react';

const requested = new Map<FontId, Promise<void>>();

/**
 * Starts loading a font's styles (its `@font-face` rules). Until its files arrive, the
 * fallbacks in its stack show. Resolves once the styles are in, never rejects.
 */
export function loadFont(font: FontId): Promise<void> {
  // Inter ships with the app.
  if (font === 'inter') return Promise.resolve();
  let loading = requested.get(font);
  if (!loading) {
    // The loaders for every font arrive together, after the form's first render.
    loading = import('./font-loaders')
      .then(({ loadFontFiles }) => loadFontFiles(font))
      .then(
        () => undefined,
        () => {
          // The fallback fonts keep the form readable; try again next time.
          requested.delete(font);
        },
      );
    requested.set(font, loading);
  }
  return loading;
}

/**
 * Loads a theme's heading and body fonts and waits for their files, at most `timeoutMs`, so a
 * page can show its form in its own fonts from the first paint instead of moving text about
 * when they arrive. Never rejects: on a slow connection the fallbacks show, as they would.
 */
export async function themeFontsReady(
  theme: Pick<FormTheme, 'typography'>,
  timeoutMs: number,
): Promise<void> {
  const { headingFont, bodyFont, headingWeight } = theme.typography;
  const files = async () => {
    await Promise.all([loadFont(headingFont), loadFont(bodyFont)]);
    // Without the Font Loading API (older browsers, tests), there is nothing to wait for.
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    await Promise.all([
      document.fonts.load(
        `${nearestFontWeight(headingFont, headingWeight)} 1em ${getFont(headingFont).family}`,
      ),
      document.fonts.load(`${nearestFontWeight(bodyFont, 400)} 1em ${getFont(bodyFont).family}`),
    ]);
  };
  await Promise.race([
    files().catch(() => undefined),
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
}

/** Loads the theme's heading and body fonts, and nothing else. */
export function useThemeFonts(theme: Pick<FormTheme, 'typography'>): void {
  const { headingFont, bodyFont } = theme.typography;
  useEffect(() => {
    void loadFont(headingFont);
    void loadFont(bodyFont);
  }, [headingFont, bodyFont]);
}
