import { getFont, nearestFontWeight, type FontId, type FormTheme } from '@formyx/shared';
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
  manrope: () => import('@fontsource-variable/manrope'),
  'plus-jakarta-sans': () => import('@fontsource-variable/plus-jakarta-sans'),
  'work-sans': () => import('@fontsource-variable/work-sans'),
  figtree: () => import('@fontsource-variable/figtree'),
  outfit: () => import('@fontsource-variable/outfit'),
  'public-sans': () => import('@fontsource-variable/public-sans'),
  sora: () => import('@fontsource-variable/sora'),
  lora: () => import('@fontsource-variable/lora'),
  merriweather: () => import('@fontsource-variable/merriweather'),
  'libre-baskerville': () => import('@fontsource-variable/libre-baskerville'),
  'crimson-pro': () => import('@fontsource-variable/crimson-pro'),
  literata: () => import('@fontsource-variable/literata'),
  'eb-garamond': () => import('@fontsource-variable/eb-garamond'),
  newsreader: () => import('@fontsource-variable/newsreader'),
  syne: () => import('@fontsource-variable/syne'),
  unbounded: () => import('@fontsource-variable/unbounded'),
  'bodoni-moda': () => import('@fontsource-variable/bodoni-moda'),
  quicksand: () => import('@fontsource-variable/quicksand'),
  comfortaa: () => import('@fontsource-variable/comfortaa'),
  fredoka: () => import('@fontsource-variable/fredoka'),
  'baloo-2': () => import('@fontsource-variable/baloo-2'),
  caveat: () => import('@fontsource-variable/caveat'),
  'dancing-script': () => import('@fontsource-variable/dancing-script'),
  'jetbrains-mono': () => import('@fontsource-variable/jetbrains-mono'),
  'roboto-mono': () => import('@fontsource-variable/roboto-mono'),
  'source-code-pro': () => import('@fontsource-variable/source-code-pro'),
  'fira-code': () => import('@fontsource-variable/fira-code'),
  'dm-serif-display': () => Promise.all([import('@fontsource/dm-serif-display/400.css')]),
  kalam: () =>
    Promise.all([
      import('@fontsource/kalam/300.css'),
      import('@fontsource/kalam/400.css'),
      import('@fontsource/kalam/700.css'),
    ]),
  'patrick-hand': () => Promise.all([import('@fontsource/patrick-hand/400.css')]),
  'ibm-plex-mono': () =>
    Promise.all([
      import('@fontsource/ibm-plex-mono/400.css'),
      import('@fontsource/ibm-plex-mono/500.css'),
      import('@fontsource/ibm-plex-mono/600.css'),
      import('@fontsource/ibm-plex-mono/700.css'),
    ]),
  'space-mono': () =>
    Promise.all([
      import('@fontsource/space-mono/400.css'),
      import('@fontsource/space-mono/700.css'),
    ]),
};

const requested = new Map<FontId, Promise<void>>();

/**
 * Starts loading a font's styles (its `@font-face` rules). Until its files arrive, the
 * fallbacks in its stack show. Resolves once the styles are in, never rejects.
 */
export function loadFont(font: FontId): Promise<void> {
  const load = FONT_LOADERS[font];
  if (!load) return Promise.resolve();
  let loading = requested.get(font);
  if (!loading) {
    loading = Promise.all([
      load(),
      // Its resized local fallback, so text does not move when the font arrives.
      import('./font-fallbacks').then(({ addFallbackFace }) => {
        addFallbackFace(font);
      }),
    ]).then(
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
