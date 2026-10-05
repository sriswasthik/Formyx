import { z } from 'zod';
import { round1, seededRandom } from '../random.js';
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
  {
    id: 'star',
    name: 'Star',
    category: 'geometric',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: 'M50 5L61.8 36.8L95.7 38.2L69 59.2L78.2 91.8L50 73L21.8 91.8L31 59.2L4.3 38.2L38.2 36.8Z',
    draw: { kind: 'fill' },
  },
  {
    id: 'arch',
    name: 'Arch',
    category: 'geometric',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: 'M18 100V48A32 32 0 0 1 82 48V100Z',
    draw: { kind: 'fill' },
  },
  {
    id: 'wave',
    name: 'Wave',
    category: 'organic',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: 'M0 40C17 26 33 26 50 40S83 54 100 40V60C83 74 67 74 50 60S17 46 0 60Z',
    draw: { kind: 'fill' },
  },
  {
    id: 'confetti',
    name: 'Confetti',
    category: 'geometric',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: 'M44 14H56A6 6 0 0 1 62 20V80A6 6 0 0 1 56 86H44A6 6 0 0 1 38 80V20A6 6 0 0 1 44 14Z',
    draw: { kind: 'fill' },
  },
  {
    id: 'triangle',
    name: 'Triangle',
    category: 'geometric',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: 'M50 8L95 88H5Z',
    draw: { kind: 'fill' },
  },
  {
    id: 'square',
    name: 'Square',
    category: 'geometric',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: 'M20 10H80A10 10 0 0 1 90 20V80A10 10 0 0 1 80 90H20A10 10 0 0 1 10 80V20A10 10 0 0 1 20 10Z',
    draw: { kind: 'fill' },
  },
  {
    id: 'half-circle',
    name: 'Half circle',
    category: 'geometric',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: 'M5 72A45 45 0 0 1 95 72Z',
    draw: { kind: 'fill' },
  },
  {
    id: 'cross',
    name: 'Cross',
    category: 'geometric',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    path: 'M38 8H62V38H92V62H62V92H38V62H8V38H38Z',
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

/** How many points a generated blob has round its edge. */
const BLOB_POINTS = 7;

/**
 * A smooth, closed blob inside `SHAPE_VIEWBOX`, the same for the same seed: points round the
 * centre at jittered radii, joined by a Catmull-Rom curve drawn as cubic Béziers.
 */
export function blobPath(seed: number): string {
  const random = seededRandom(seed);
  const points = Array.from({ length: BLOB_POINTS }, (_, index) => {
    const angle = (index / BLOB_POINTS) * Math.PI * 2 + random.between(-0.25, 0.25);
    const radius = random.between(30, 46);
    return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius] as const;
  });
  const at = (index: number) => {
    const point = points[(index + BLOB_POINTS) % BLOB_POINTS];
    if (!point) throw new Error('Blob point missing');
    return point;
  };
  const clamp = (value: number) => round1(Math.min(100, Math.max(0, value)));
  const [startX, startY] = at(0);
  let path = `M${clamp(startX)} ${clamp(startY)}`;
  for (let index = 0; index < BLOB_POINTS; index += 1) {
    const [x0, y0] = at(index - 1);
    const [x1, y1] = at(index);
    const [x2, y2] = at(index + 1);
    const [x3, y3] = at(index + 2);
    const c1 = [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6].map(clamp);
    const c2 = [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6].map(clamp);
    path += `C${c1.join(' ')} ${c2.join(' ')} ${clamp(x2)} ${clamp(y2)}`;
  }
  return `${path}Z`;
}

/** The path a shape item is drawn with: blobs with a seed are generated, the rest fixed. */
export function shapeItemPath(item: { type: ShapeId; seed?: number | undefined }): string {
  if (item.type === 'blob' && item.seed !== undefined) return blobPath(item.seed);
  return getShape(item.type).path;
}
