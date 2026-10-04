import { z } from 'zod';
import { assetIds, FORMYX_LICENSE, FORMYX_SOURCE, type Asset } from './asset.js';

export const SHAPE_CATEGORIES = ['geometric', 'organic', 'line'] as const;
export type ShapeCategory = (typeof SHAPE_CATEGORIES)[number];

/** The square every shape's path is drawn in. */
export const SHAPE_VIEWBOX = '0 0 100 100';

export interface ShapeAsset<Id extends string = string> extends Asset<Id, ShapeCategory> {
  /** SVG path data inside `SHAPE_VIEWBOX`. */
  path: string;
  /** Filled shapes take the colour as fill; line shapes as a stroke this wide (viewBox units). */
  draw: { kind: 'fill'; fillRule?: 'evenodd' } | { kind: 'stroke'; width: number };
}

const CIRCLE = 'M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z';

export const SHAPES = [
  {
    id: 'circle',
    name: 'Circle',
    category: 'geometric',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: CIRCLE,
    draw: { kind: 'fill' },
  },
  {
    id: 'ring',
    name: 'Ring',
    category: 'geometric',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: `${CIRCLE}M50 20A30 30 0 1 0 50 80A30 30 0 1 0 50 20Z`,
    draw: { kind: 'fill', fillRule: 'evenodd' },
  },
  {
    id: 'pill',
    name: 'Pill',
    category: 'geometric',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: 'M26 30H74A20 20 0 0 1 74 70H26A20 20 0 0 1 26 30Z',
    draw: { kind: 'fill' },
  },
  {
    id: 'blob',
    name: 'Blob',
    category: 'organic',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: 'M50 4C68 4 86 12 93 30C100 48 96 68 84 82C72 96 52 99 35 94C18 89 5 76 4 58C3 40 10 22 24 12C32 6 40 4 50 4Z',
    draw: { kind: 'fill' },
  },
  {
    id: 'sparkle',
    name: 'Sparkle',
    category: 'organic',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: 'M50 0C53 31 69 47 100 50C69 53 53 69 50 100C47 69 31 53 0 50C31 47 47 31 50 0Z',
    draw: { kind: 'fill' },
  },
  {
    id: 'squiggle',
    name: 'Squiggle',
    category: 'line',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: 'M6 50C16 26 28 26 38 50S60 74 70 50S88 26 94 50',
    draw: { kind: 'stroke', width: 8 },
  },
  {
    id: 'arc',
    name: 'Arc',
    category: 'geometric',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: 'M2 78A48 48 0 0 1 98 78H76A26 26 0 0 0 24 78Z',
    draw: { kind: 'fill' },
  },
] as const satisfies readonly ShapeAsset[];

export type ShapeId = (typeof SHAPES)[number]['id'];
export const SHAPE_IDS = assetIds(SHAPES);
export const shapeIdSchema = z.enum(SHAPE_IDS, { error: 'Pick one of the shapes Formyx offers' });

const SHAPES_BY_ID = new Map<string, ShapeAsset<ShapeId>>(SHAPES.map((shape) => [shape.id, shape]));

export function getShape(id: ShapeId): ShapeAsset<ShapeId> {
  const shape = SHAPES_BY_ID.get(id);
  if (!shape) throw new Error(`Unknown shape: ${id}`);
  return shape;
}
