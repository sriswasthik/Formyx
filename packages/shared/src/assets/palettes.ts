import { assetIds, FORMYX_LICENSE, FORMYX_SOURCE, type Asset } from './asset.js';

export const PALETTE_CATEGORIES = ['warm', 'cool', 'neutral', 'dark'] as const;
export type PaletteCategory = (typeof PALETTE_CATEGORIES)[number];

export interface GradientPalette<Id extends string = string> extends Asset<Id, PaletteCategory> {
  /** Four to six colours that sit well together, lightest or most dominant first. */
  colors: readonly string[];
}

/**
 * Colour sets for gradients and mesh gradients. Once applied, a theme holds plain colours, so
 * a palette's tier only decides its badge in pickers; what a theme needs to publish comes
 * from the features it uses (see `requiredFeatures`). All palettes start free.
 */
export const GRADIENT_PALETTES = [
  {
    id: 'dawn',
    name: 'Dawn',
    category: 'warm',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    colors: ['#FBEFE6', '#F6D3C2', '#EDB8A8', '#D9C6E0', '#F9E7D2'],
  },
  {
    id: 'sea-glass',
    name: 'Sea glass',
    category: 'cool',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    colors: ['#E6F2EE', '#BFE0D6', '#9CCBC4', '#C9DDEB', '#EEF5E9'],
  },
  {
    id: 'sand',
    name: 'Sand',
    category: 'warm',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    colors: ['#F6EFE4', '#EBD9BF', '#DDBF9A', '#F2E6D6', '#E7D3C4'],
  },
  {
    id: 'meadow',
    name: 'Meadow',
    category: 'cool',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    colors: ['#EEF3E6', '#D3E3C4', '#B5CFA6', '#E6EDD6', '#C9DCC8'],
  },
  {
    id: 'stone',
    name: 'Stone',
    category: 'neutral',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    colors: ['#F4F4F5', '#E4E4E7', '#D4D4D8', '#ECEAE6', '#DCDAD5'],
  },
  {
    id: 'night',
    name: 'Night',
    category: 'dark',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    colors: ['#141A24', '#1D2A3A', '#253B4F', '#1A2230', '#2C3444'],
  },
] as const satisfies readonly GradientPalette[];

export type PaletteId = (typeof GRADIENT_PALETTES)[number]['id'];
export const PALETTE_IDS = assetIds(GRADIENT_PALETTES);
