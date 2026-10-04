import { z } from 'zod';
import { assetIds, type Asset } from './asset.js';

export const FONT_CATEGORIES = ['sans', 'serif', 'rounded', 'display'] as const;
export type FontCategory = (typeof FONT_CATEGORIES)[number];

export interface FontAsset<Id extends string = string> extends Asset<Id, FontCategory> {
  /** The CSS family name its font files declare. */
  family: string;
  /** Shown while the font loads, or if it fails to. */
  fallback: string;
  /** What pickers write in the font. */
  sample: string;
}

const SANS = 'ui-sans-serif, system-ui, sans-serif';
const SERIF = 'ui-serif, Georgia, Cambria, serif';
const fontsource = (slug: string) => `https://fontsource.org/fonts/${slug}`;

/**
 * Fonts creators can use. All are variable fonts under the SIL Open Font License, served from
 * our own origin through `@fontsource-variable` packages (the web app loads one only when a
 * form uses it).
 */
export const FONTS = [
  {
    id: 'inter',
    name: 'Inter',
    category: 'sans',
    tier: 'free',
    license: 'OFL-1.1',
    source: fontsource('inter'),
    family: "'Inter Variable'",
    fallback: `'Inter Fallback', ${SANS}`,
    sample: 'Aa',
  },
  {
    id: 'source-serif-4',
    name: 'Source Serif',
    category: 'serif',
    tier: 'free',
    license: 'OFL-1.1',
    source: fontsource('source-serif-4'),
    family: "'Source Serif 4 Variable'",
    fallback: SERIF,
    sample: 'Aa',
  },
  {
    id: 'nunito',
    name: 'Nunito',
    category: 'rounded',
    tier: 'free',
    license: 'OFL-1.1',
    source: fontsource('nunito'),
    family: "'Nunito Variable'",
    fallback: `ui-rounded, 'SF Pro Rounded', ${SANS}`,
    sample: 'Aa',
  },
  {
    id: 'dm-sans',
    name: 'DM Sans',
    category: 'sans',
    tier: 'free',
    license: 'OFL-1.1',
    source: fontsource('dm-sans'),
    family: "'DM Sans Variable'",
    fallback: SANS,
    sample: 'Aa',
  },
  {
    id: 'fraunces',
    name: 'Fraunces',
    category: 'display',
    tier: 'pro',
    license: 'OFL-1.1',
    source: fontsource('fraunces'),
    family: "'Fraunces Variable'",
    fallback: SERIF,
    sample: 'Aa',
  },
  {
    id: 'playfair-display',
    name: 'Playfair Display',
    category: 'display',
    tier: 'pro',
    license: 'OFL-1.1',
    source: fontsource('playfair-display'),
    family: "'Playfair Display Variable'",
    fallback: SERIF,
    sample: 'Aa',
  },
  {
    id: 'space-grotesk',
    name: 'Space Grotesk',
    category: 'display',
    tier: 'pro',
    license: 'OFL-1.1',
    source: fontsource('space-grotesk'),
    family: "'Space Grotesk Variable'",
    fallback: SANS,
    sample: 'Aa',
  },
  {
    id: 'bricolage-grotesque',
    name: 'Bricolage Grotesque',
    category: 'display',
    tier: 'pro',
    license: 'OFL-1.1',
    source: fontsource('bricolage-grotesque'),
    family: "'Bricolage Grotesque Variable'",
    fallback: SANS,
    sample: 'Aa',
  },
] as const satisfies readonly FontAsset[];

export type FontId = (typeof FONTS)[number]['id'];
export const FONT_IDS = assetIds(FONTS);
export const fontIdSchema = z.enum(FONT_IDS, { error: 'Pick one of the fonts Formyx offers' });

const FONTS_BY_ID = new Map<string, FontAsset<FontId>>(FONTS.map((font) => [font.id, font]));

export function getFont(id: FontId): FontAsset<FontId> {
  const font = FONTS_BY_ID.get(id);
  if (!font) throw new Error(`Unknown font: ${id}`);
  return font;
}

/** The CSS `font-family` value for a font, with its fallbacks. */
export function fontStack(id: FontId): string {
  const { family, fallback } = getFont(id);
  return `${family}, ${fallback}`;
}
