import type { AssetTier } from './asset.js';
import { getFont, type FontId } from './fonts.js';

export interface FontPairing<Id extends string = string> {
  id: Id;
  name: string;
  description: string;
  headingFont: FontId;
  bodyFont: FontId;
  /** A heading weight that suits the heading font. */
  headingWeight: number;
}

/**
 * Heading and body fonts that go well together, one click each in the font picker. Pairings
 * only set fonts (themes store the fonts, not the pairing), but keep their ids stable anyway.
 */
export const FONT_PAIRINGS = [
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'A soft display serif over a reading serif.',
    headingFont: 'fraunces',
    bodyFont: 'source-serif-4',
    headingWeight: 600,
  },
  {
    id: 'friendly',
    name: 'Friendly',
    description: 'Rounded headings with a clear, open sans.',
    headingFont: 'nunito',
    bodyFont: 'dm-sans',
    headingWeight: 800,
  },
  {
    id: 'corporate',
    name: 'Corporate',
    description: 'Crisp and neutral, made for interfaces.',
    headingFont: 'manrope',
    bodyFont: 'inter',
    headingWeight: 700,
  },
  {
    id: 'playful',
    name: 'Playful',
    description: 'A characterful grotesque with a warm sans.',
    headingFont: 'bricolage-grotesque',
    bodyFont: 'figtree',
    headingWeight: 700,
  },
  {
    id: 'elegant',
    name: 'Elegant',
    description: 'High-contrast headings over a gentle serif.',
    headingFont: 'playfair-display',
    bodyFont: 'lora',
    headingWeight: 600,
  },
  {
    id: 'technical',
    name: 'Technical',
    description: 'Monospaced headings with a plain sans.',
    headingFont: 'jetbrains-mono',
    bodyFont: 'inter',
    headingWeight: 700,
  },
  {
    id: 'handmade',
    name: 'Handmade',
    description: 'Handwritten headings with a rounded sans.',
    headingFont: 'caveat',
    bodyFont: 'nunito',
    headingWeight: 700,
  },
] as const satisfies readonly FontPairing[];

export type FontPairingId = (typeof FONT_PAIRINGS)[number]['id'];

/** Pro if either of its fonts is. */
export function pairingTier(pairing: Pick<FontPairing, 'headingFont' | 'bodyFont'>): AssetTier {
  return [pairing.headingFont, pairing.bodyFont].some((id) => getFont(id).tier === 'pro')
    ? 'pro'
    : 'free';
}
