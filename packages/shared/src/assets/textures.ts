import { z } from 'zod';
import { assetIds, FORMYX_LICENSE, FORMYX_SOURCE, type Asset } from './asset.js';

export const TEXTURE_CATEGORIES = ['noise', 'pattern', 'material'] as const;
export type TextureCategory = (typeof TEXTURE_CATEGORIES)[number];

export interface TextureAsset<Id extends string = string> extends Asset<Id, TextureCategory> {
  /**
   * A tiling SVG under the web app's `public/` folder. Only its alpha is used: textures are
   * drawn as a mask over a tint colour, so one file works on light and dark backgrounds.
   */
  file: string;
  /** Width and height of one tile at scale 1, in CSS pixels. */
  tileSize: number;
  /** Colours a picker shows the texture in. */
  swatch: { background: string; tint: string };
}

const LIGHT_SWATCH = { background: '#F4F4F5', tint: '#18181B' };

export const TEXTURES = [
  {
    id: 'grain',
    name: 'Grain',
    category: 'noise',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    file: 'textures/grain.svg',
    tileSize: 200,
    swatch: LIGHT_SWATCH,
  },
  {
    id: 'dots',
    name: 'Dots',
    category: 'pattern',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    file: 'textures/dots.svg',
    tileSize: 24,
    swatch: LIGHT_SWATCH,
  },
  {
    id: 'grid',
    name: 'Grid',
    category: 'pattern',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    file: 'textures/grid.svg',
    tileSize: 32,
    swatch: LIGHT_SWATCH,
  },
  {
    id: 'paper',
    name: 'Paper',
    category: 'material',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    file: 'textures/paper.svg',
    tileSize: 320,
    swatch: { background: '#F7F3EA', tint: '#5C4A32' },
  },
  {
    id: 'linen',
    name: 'Linen',
    category: 'material',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    file: 'textures/linen.svg',
    tileSize: 160,
    swatch: { background: '#EEF0EC', tint: '#3F4A3C' },
  },
] as const satisfies readonly TextureAsset[];

export type TextureId = (typeof TEXTURES)[number]['id'];
export const TEXTURE_IDS = assetIds(TEXTURES);
export const textureIdSchema = z.enum(TEXTURE_IDS, {
  error: 'Pick one of the textures Formyx offers',
});

const TEXTURES_BY_ID = new Map<string, TextureAsset<TextureId>>(
  TEXTURES.map((texture) => [texture.id, texture]),
);

export function getTexture(id: TextureId): TextureAsset<TextureId> {
  const texture = TEXTURES_BY_ID.get(id);
  if (!texture) throw new Error(`Unknown texture: ${id}`);
  return texture;
}
