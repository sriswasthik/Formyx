import type { FontId } from '@formyx/shared';
import { addFallbackFace } from './font-fallbacks';

/**
 * How each registry font's files arrive. Inter ships with the app; the others load on first
 * use, so a form only ever fetches the fonts it shows. This table loads lazily too (see
 * `loadFont`), keeping forty loaders out of the public form's first download. Typed against
 * the registry, so adding a font without a loader does not compile.
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

/** Adds a font's `@font-face` rules and its resized local fallback, so text does not move. */
export async function loadFontFiles(font: FontId): Promise<void> {
  addFallbackFace(font);
  await FONT_LOADERS[font]?.();
}
