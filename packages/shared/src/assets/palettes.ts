import { assetIds, FORMYX_LICENSE, FORMYX_SOURCE, type Asset } from './asset.js';

export const PALETTE_CATEGORIES = ['warm', 'cool', 'neutral', 'dark', 'vivid'] as const;
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
  {
    id: 'soft-pastel',
    name: 'Soft pastel',
    category: 'cool',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    colors: ['#FDF2F8', '#E0E7FF', '#DCFCE7', '#FEF3C7', '#E9D5FF'],
  },
  {
    id: 'earthy',
    name: 'Earthy',
    category: 'warm',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    colors: ['#EFE6D8', '#D6BFA0', '#B9896A', '#8E9B7A', '#E3D3BC'],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    category: 'warm',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    colors: ['#FFE8D6', '#FFC9A8', '#F79F8A', '#E7839C', '#FFD9B8'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    category: 'cool',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    colors: ['#E0F2F7', '#A8D8E8', '#6FB3D2', '#3E7FA8', '#CDEBF2'],
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    category: 'neutral',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    colors: ['#FAFAFA', '#E4E4E7', '#C4C4CC', '#A1A1AA', '#D4D4D8'],
  },
  {
    id: 'bold',
    name: 'Bold',
    category: 'vivid',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    colors: ['#FF6B4A', '#FFC23D', '#2EC4B6', '#3A6FF7', '#F24C9A'],
  },
] as const satisfies readonly GradientPalette[];

export type PaletteId = (typeof GRADIENT_PALETTES)[number]['id'];
export const PALETTE_IDS = assetIds(GRADIENT_PALETTES);

/** The palettes the mesh editor offers first: a curated set across moods. */
export const CURATED_PALETTE_IDS = [
  'soft-pastel',
  'earthy',
  'sunset',
  'ocean',
  'monochrome',
  'bold',
] as const satisfies readonly PaletteId[];

export function getPalette(id: PaletteId): GradientPalette<PaletteId> {
  const palette = GRADIENT_PALETTES.find((candidate) => candidate.id === id);
  if (!palette) throw new Error(`Unknown palette: ${id}`);
  return palette;
}
