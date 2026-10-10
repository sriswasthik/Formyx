import type { FontId } from '@formyx/shared';
import { COMPUTED_FALLBACKS } from './fallback-metrics';

export interface FallbackFace {
  /** A font nearly every device has. */
  local: 'Arial' | 'Georgia' | 'Courier New';
  /** Percentages of the local font's own size, ascent and descent. */
  sizeAdjust: number;
  ascent: number;
  descent: number;
}

/** Measured in Chromium against `local` over ordinary English text, for the first fonts. */
const MEASURED_FALLBACKS = {
  'source-serif-4': {
    family: 'Source Serif 4 Fallback',
    local: 'Georgia',
    sizeAdjust: 107.66,
    ascent: 96.6,
    descent: 31.58,
  },
  nunito: {
    family: 'Nunito Fallback',
    local: 'Arial',
    sizeAdjust: 100.43,
    ascent: 100.56,
    descent: 34.85,
  },
  'dm-sans': {
    family: 'DM Sans Fallback',
    local: 'Arial',
    sizeAdjust: 103.57,
    ascent: 95.58,
    descent: 29.93,
  },
  fraunces: {
    family: 'Fraunces Fallback',
    local: 'Georgia',
    sizeAdjust: 105.5,
    ascent: 92.89,
    descent: 24.65,
  },
  'playfair-display': {
    family: 'Playfair Display Fallback',
    local: 'Georgia',
    sizeAdjust: 101.57,
    ascent: 106.33,
    descent: 24.61,
  },
  'space-grotesk': {
    family: 'Space Grotesk Fallback',
    local: 'Arial',
    sizeAdjust: 107.94,
    ascent: 90.79,
    descent: 26.87,
  },
  'bricolage-grotesque': {
    family: 'Bricolage Grotesque Fallback',
    local: 'Arial',
    sizeAdjust: 104.92,
    ascent: 88.64,
    descent: 25.73,
  },
} as const satisfies Record<string, FallbackFace & { family: string }>;

/*
 * Local fonts resized to each theme font's average width, ascent and descent, named as the
 * registry's fallbacks name them (`'DM Sans Fallback'`), so text keeps its place when the font
 * arrives. The rest are worked out from published metrics (scripts/font-fallback-metrics.mjs).
 * Loaded with the font itself, so pages pay only for the fonts they show. Inter's is in the
 * app's styles, since every page uses it. Typed against the registry, so a new font without
 * a fallback does not compile.
 */
export const FALLBACK_FACES: Record<Exclude<FontId, 'inter'>, FallbackFace & { family: string }> = {
  ...COMPUTED_FALLBACKS,
  ...MEASURED_FALLBACKS,
};

const added = new Set<FontId>();

/** Adds a font's resized local fallback to the page, once. */
export function addFallbackFace(font: FontId): void {
  if (font === 'inter' || added.has(font)) return;
  // Without the Font Loading API (older browsers, tests) the plain fallbacks show instead.
  if (
    typeof FontFace === 'undefined' ||
    typeof document === 'undefined' ||
    !('fonts' in document)
  ) {
    return;
  }
  const face = FALLBACK_FACES[font];
  added.add(font);
  // TypeScript's DOM types do not list `sizeAdjust` yet; every engine with FontFace takes it.
  const descriptors: FontFaceDescriptors & { sizeAdjust: string } = {
    sizeAdjust: `${face.sizeAdjust}%`,
    ascentOverride: `${face.ascent}%`,
    descentOverride: `${face.descent}%`,
    lineGapOverride: '0%',
  };
  document.fonts.add(new FontFace(face.family, `local('${face.local}')`, descriptors));
}
