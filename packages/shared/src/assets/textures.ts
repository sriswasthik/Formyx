import { z } from 'zod';
import { assetIds, FORMYX_LICENSE, FORMYX_SOURCE, type Asset } from './asset.js';

export const TEXTURE_CATEGORIES = ['noise', 'pattern', 'material'] as const;
export type TextureCategory = (typeof TEXTURE_CATEGORIES)[number];

/**
 * How a texture's tile is made. Only its alpha is used: textures are drawn as a mask over a
 * tint colour, so one tile works on light and dark backgrounds.
 * - `pattern`: an SVG drawn in code (`textureTile`), with a density control.
 * - `photo`: a WebP under the web app's `public/` folder, its grain stored in the alpha.
 */
export type TextureSource =
  | { kind: 'pattern' }
  | {
      kind: 'photo';
      file: string;
      /** Average alpha of the tile, 0 to 1, for the readability check. */
      coverage: number;
    };

export interface TextureAsset<Id extends string = string> extends Asset<Id, TextureCategory> {
  draw: TextureSource;
  /** Width and height of one tile at scale 1, in CSS pixels. */
  tileSize: number;
  /** Colours a picker shows the texture in. */
  swatch: { background: string; tint: string };
}

const LIGHT_SWATCH = { background: '#F4F4F5', tint: '#18181B' };
const PATTERN = { kind: 'pattern' } as const;

export const TEXTURES = [
  {
    id: 'grain',
    name: 'Grain',
    category: 'noise',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    draw: PATTERN,
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
    draw: PATTERN,
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
    draw: PATTERN,
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
    draw: { kind: 'photo', file: 'textures/paper.webp', coverage: 0.3 },
    tileSize: 384,
    swatch: { background: '#F7F3EA', tint: '#5C4A32' },
  },
  {
    id: 'linen',
    name: 'Linen',
    category: 'material',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    draw: { kind: 'photo', file: 'textures/linen.webp', coverage: 0.3 },
    tileSize: 256,
    swatch: { background: '#EEF0EC', tint: '#3F4A3C' },
  },
  {
    id: 'diagonal',
    name: 'Diagonal lines',
    category: 'pattern',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    draw: PATTERN,
    tileSize: 16,
    swatch: LIGHT_SWATCH,
  },
  {
    id: 'checker',
    name: 'Checker',
    category: 'pattern',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    draw: PATTERN,
    tileSize: 32,
    swatch: LIGHT_SWATCH,
  },
  {
    id: 'cross-hatch',
    name: 'Cross-hatch',
    category: 'pattern',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    draw: PATTERN,
    tileSize: 16,
    swatch: LIGHT_SWATCH,
  },
  {
    id: 'waves',
    name: 'Waves',
    category: 'pattern',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    draw: PATTERN,
    tileSize: 40,
    swatch: LIGHT_SWATCH,
  },
  {
    id: 'topographic',
    name: 'Topographic',
    category: 'pattern',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    draw: PATTERN,
    tileSize: 400,
    swatch: { background: '#EEF2EC', tint: '#2F4A3A' },
  },
  {
    id: 'paper-fibre',
    name: 'Paper fibre',
    category: 'noise',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    draw: PATTERN,
    tileSize: 240,
    swatch: { background: '#F7F3EA', tint: '#5C4A32' },
  },
  {
    id: 'concrete',
    name: 'Concrete',
    category: 'material',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    draw: { kind: 'photo', file: 'textures/concrete.webp', coverage: 0.3 },
    tileSize: 384,
    swatch: { background: '#E7E5E4', tint: '#292524' },
  },
] as const satisfies readonly TextureAsset[];

export type TextureId = (typeof TEXTURES)[number]['id'];
export type PatternTextureId = Extract<
  (typeof TEXTURES)[number],
  { draw: { kind: 'pattern' } }
>['id'];
export const TEXTURE_IDS = assetIds(TEXTURES);
export const textureIdSchema = z.enum(TEXTURE_IDS, {
  error: 'Pick one of the textures Formyx offers',
});

/** Density when a texture layer does not set one. */
export const DEFAULT_TEXTURE_DENSITY = 0.5;

const TEXTURES_BY_ID = new Map<string, TextureAsset<TextureId>>(
  TEXTURES.map((texture) => [texture.id, texture]),
);

export function getTexture(id: TextureId): TextureAsset<TextureId> {
  const texture = TEXTURES_BY_ID.get(id);
  if (!texture) throw new Error(`Unknown texture: ${id}`);
  return texture;
}
