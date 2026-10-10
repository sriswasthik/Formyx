import { z } from 'zod';
import { assetIds, type Asset, type AssetTier } from './asset.js';

/** In the order pickers list them. */
export const FONT_CATEGORIES = [
  'sans',
  'serif',
  'display',
  'rounded',
  'handwritten',
  'mono',
] as const;
export type FontCategory = (typeof FONT_CATEGORIES)[number];

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sans',
  serif: 'Serif',
  display: 'Display',
  rounded: 'Rounded',
  handwritten: 'Handwritten',
  mono: 'Mono',
};

export interface FontAsset<Id extends string = string> extends Asset<Id, FontCategory> {
  /** The CSS family name its font files declare. */
  family: string;
  /**
   * Shown while the font loads, or if it fails to. Starts with a local font resized to match
   * it (added by the web app with the font), so text does not move when it arrives.
   */
  fallback: string;
  /** What pickers write in the font. */
  sample: string;
  /**
   * The weights it has, lightest first. Variable fonts have every weight in their range;
   * the others only these, so other weights are drawn with the nearest one.
   */
  weights: readonly number[];
}

const SANS = 'ui-sans-serif, system-ui, sans-serif';
const SERIF = 'ui-serif, Georgia, Cambria, serif';
const ROUNDED = `ui-rounded, 'SF Pro Rounded', ${SANS}`;
const HANDWRITTEN = `'Segoe Print', 'Bradley Hand', cursive`;
const MONO = `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;

/** The generic families after a font's own fallback. */
const GENERIC = {
  sans: SANS,
  serif: SERIF,
  rounded: ROUNDED,
  handwritten: HANDWRITTEN,
  mono: MONO,
};

interface FontOptions {
  /** The family name its files declare, without " Variable", if not the font's name. */
  familyName?: string;
  /** A static font (only the listed weights); variable fonts' family ends in " Variable". */
  isStatic?: boolean;
  /** Which generic families follow it; by category if not set (display fonts must say). */
  generic?: keyof typeof GENERIC;
}

/** Every font is from Fontsource, under the SIL Open Font License. */
function font<const Id extends string>(
  id: Id,
  name: string,
  category: FontCategory,
  tier: AssetTier,
  weights: readonly number[],
  { familyName = name, isStatic = false, generic }: FontOptions = {},
): FontAsset<Id> {
  const genericKey = generic ?? (category === 'display' ? 'sans' : category);
  return {
    id,
    name,
    category,
    tier,
    license: 'OFL-1.1',
    source: `https://fontsource.org/fonts/${id}`,
    family: isStatic ? `'${familyName}'` : `'${familyName} Variable'`,
    fallback: `'${familyName} Fallback', ${GENERIC[genericKey]}`,
    sample: 'Aa',
    weights,
  };
}

/** Every hundred from `min` to `max`: a variable font's weights. */
function range(min: number, max: number): number[] {
  return Array.from({ length: (max - min) / 100 + 1 }, (_, index) => min + index * 100);
}

/**
 * Fonts creators can use, served from our own origin through Fontsource packages (the web
 * app loads one only when a form uses it). Saved themes refer to them by id: never rename or
 * remove one, retire it from pickers instead.
 */
export const FONTS = [
  // Sans
  font('inter', 'Inter', 'sans', 'free', range(100, 900)),
  font('dm-sans', 'DM Sans', 'sans', 'free', range(100, 900)),
  font('manrope', 'Manrope', 'sans', 'free', range(200, 800)),
  font('plus-jakarta-sans', 'Plus Jakarta Sans', 'sans', 'free', range(200, 800)),
  font('work-sans', 'Work Sans', 'sans', 'free', range(100, 900)),
  font('figtree', 'Figtree', 'sans', 'free', range(300, 900)),
  font('outfit', 'Outfit', 'sans', 'free', range(100, 900)),
  font('public-sans', 'Public Sans', 'sans', 'free', range(100, 900)),
  font('sora', 'Sora', 'sans', 'free', range(100, 800)),
  // Serif
  font('source-serif-4', 'Source Serif', 'serif', 'free', range(200, 900), {
    familyName: 'Source Serif 4',
  }),
  font('lora', 'Lora', 'serif', 'free', range(400, 700)),
  font('merriweather', 'Merriweather', 'serif', 'free', range(300, 900)),
  font('libre-baskerville', 'Libre Baskerville', 'serif', 'free', range(400, 700)),
  font('crimson-pro', 'Crimson Pro', 'serif', 'free', range(200, 900)),
  font('literata', 'Literata', 'serif', 'free', range(200, 900)),
  font('eb-garamond', 'EB Garamond', 'serif', 'pro', range(400, 800)),
  font('newsreader', 'Newsreader', 'serif', 'pro', range(200, 800)),
  // Display
  font('fraunces', 'Fraunces', 'display', 'pro', range(100, 900), { generic: 'serif' }),
  font('playfair-display', 'Playfair Display', 'display', 'pro', range(400, 900), {
    generic: 'serif',
  }),
  font('space-grotesk', 'Space Grotesk', 'display', 'pro', range(300, 700)),
  font('bricolage-grotesque', 'Bricolage Grotesque', 'display', 'pro', range(200, 800)),
  font('syne', 'Syne', 'display', 'pro', range(400, 800)),
  font('unbounded', 'Unbounded', 'display', 'pro', range(200, 900)),
  font('bodoni-moda', 'Bodoni Moda', 'display', 'pro', range(400, 900), { generic: 'serif' }),
  font('dm-serif-display', 'DM Serif Display', 'display', 'pro', [400], {
    isStatic: true,
    generic: 'serif',
  }),
  // Rounded
  font('nunito', 'Nunito', 'rounded', 'free', range(200, 900)),
  font('quicksand', 'Quicksand', 'rounded', 'free', range(300, 700)),
  font('comfortaa', 'Comfortaa', 'rounded', 'free', range(300, 700)),
  font('fredoka', 'Fredoka', 'rounded', 'free', range(300, 700)),
  font('baloo-2', 'Baloo 2', 'rounded', 'free', range(400, 800)),
  // Handwritten
  font('kalam', 'Kalam', 'handwritten', 'free', [300, 400, 700], { isStatic: true }),
  font('patrick-hand', 'Patrick Hand', 'handwritten', 'free', [400], { isStatic: true }),
  font('caveat', 'Caveat', 'handwritten', 'pro', range(400, 700)),
  font('dancing-script', 'Dancing Script', 'handwritten', 'pro', range(400, 700)),
  // Mono
  font('jetbrains-mono', 'JetBrains Mono', 'mono', 'free', range(100, 800)),
  font('ibm-plex-mono', 'IBM Plex Mono', 'mono', 'free', [400, 500, 600, 700], {
    isStatic: true,
  }),
  font('roboto-mono', 'Roboto Mono', 'mono', 'free', range(100, 700)),
  font('source-code-pro', 'Source Code Pro', 'mono', 'free', range(200, 900)),
  font('fira-code', 'Fira Code', 'mono', 'free', range(300, 700)),
  font('space-mono', 'Space Mono', 'mono', 'free', [400, 700], { isStatic: true }),
] as const;

export type FontId = (typeof FONTS)[number]['id'];
export const FONT_IDS = assetIds(FONTS);
export const fontIdSchema = z.enum(FONT_IDS, { error: 'Pick one of the fonts Formyx offers' });

const FONTS_BY_ID = new Map<string, FontAsset<FontId>>(FONTS.map((entry) => [entry.id, entry]));

export function getFont(id: FontId): FontAsset<FontId> {
  const found = FONTS_BY_ID.get(id);
  if (!found) throw new Error(`Unknown font: ${id}`);
  return found;
}

/** The CSS `font-family` value for a font, with its fallbacks. */
export function fontStack(id: FontId): string {
  const { family, fallback } = getFont(id);
  return `${family}, ${fallback}`;
}

/** The weight a font draws `weight` with: the nearest it has, the heavier one on a tie. */
export function nearestFontWeight(id: FontId, weight: number): number {
  const { weights } = getFont(id);
  return weights.reduce((best, candidate) =>
    Math.abs(candidate - weight) <= Math.abs(best - weight) ? candidate : best,
  );
}
