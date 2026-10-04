import type { FontId, FormTheme } from '@formyx/shared';
import { useEffect } from 'react';

/**
 * How each registry font's files arrive. Inter ships with the app; the others load on first
 * use, so a form only ever fetches the fonts it shows. Typed against the registry, so adding
 * a font without a loader does not compile.
 */
export const FONT_LOADERS: Record<FontId, (() => Promise<unknown>) | null> = {
  inter: null,
  'source-serif-4': () => import('@fontsource-variable/source-serif-4'),
  nunito: () => import('@fontsource-variable/nunito'),
  'dm-sans': () => import('@fontsource-variable/dm-sans'),
  fraunces: () => import('@fontsource-variable/fraunces'),
  'playfair-display': () => import('@fontsource-variable/playfair-display'),
  'space-grotesk': () => import('@fontsource-variable/space-grotesk'),
  'bricolage-grotesque': () => import('@fontsource-variable/bricolage-grotesque'),
};

const requested = new Set<FontId>();

/** Starts loading a font's files. Until they arrive, the fallbacks in its stack show. */
export function loadFont(font: FontId): void {
  const load = FONT_LOADERS[font];
  if (!load || requested.has(font)) return;
  requested.add(font);
  load().catch(() => {
    // The fallback fonts keep the form readable; try again next time.
    requested.delete(font);
  });
}

/** Loads the theme's heading and body fonts, and nothing else. */
export function useThemeFonts(theme: Pick<FormTheme, 'typography'>): void {
  const { headingFont, bodyFont } = theme.typography;
  useEffect(() => {
    loadFont(headingFont);
    loadFont(bodyFont);
  }, [headingFont, bodyFont]);
}
