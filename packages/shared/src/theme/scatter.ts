import type { ShapeId } from '../assets/shapes.js';
import { MAX_SEED, round1, seededRandom, type Random } from '../random.js';
import { MAX_SHAPES, type BackgroundLayer, type ThemePoint, type ThemeShape } from './schema.js';

export type ShapesLayer = Extract<BackgroundLayer, { type: 'shapes' }>;

/** Width over height of the area shapes are scattered in; positions are in percent of each. */
const ASPECT = 1.6;
/** Shapes stay this far (in percent) from the edges. */
const EDGE = 4;
/** Candidates tried for each new position; more spreads them more evenly. */
const CANDIDATES = 14;

/** Whether a point is in the middle band where the form's text usually sits. */
function inTextColumn({ x }: ThemePoint): boolean {
  return x > 28 && x < 72;
}

function distance(a: ThemePoint, b: ThemePoint): number {
  return Math.hypot((a.x - b.x) * ASPECT, a.y - b.y);
}

/**
 * `count` positions, the same for the same seed, spread out (Mitchell's best candidate) and
 * kept away from `existing` ones. They lean towards the sides, away from the text.
 */
export function scatterPositions(
  seed: number,
  count: number,
  existing: readonly ThemePoint[] = [],
): ThemePoint[] {
  const random = seededRandom(seed);
  const placed: ThemePoint[] = [...existing];
  const added: ThemePoint[] = [];
  for (let index = 0; index < count; index += 1) {
    let best: ThemePoint | null = null;
    let bestScore = -1;
    for (let attempt = 0; attempt < CANDIDATES; attempt += 1) {
      const candidate = {
        x: round1(random.between(EDGE, 100 - EDGE)),
        y: round1(random.between(EDGE, 100 - EDGE)),
      };
      const nearest = placed.reduce(
        (closest, point) => Math.min(closest, distance(point, candidate)),
        200,
      );
      const score = nearest * (inTextColumn(candidate) ? 0.35 : 1);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best) {
      placed.push(best);
      added.push(best);
    }
  }
  return added;
}

export interface ScatterRecipe {
  id: string;
  name: string;
  kinds: readonly ShapeId[];
  /** How many shapes it starts with. */
  count: number;
  size: readonly [number, number];
  opacity: readonly [number, number];
  blur: readonly [number, number];
  /** Rotation limit either way, in degrees. */
  rotation: number;
}

/** Ready-made sets of shapes for "Add shapes"; they are starting points, not stored. */
export const SCATTER_RECIPES = [
  {
    id: 'blobs',
    name: 'Blobs',
    kinds: ['blob'],
    count: 5,
    size: [22, 42],
    opacity: [0.7, 0.95],
    blur: [0, 0],
    rotation: 180,
  },
  {
    id: 'circles',
    name: 'Circles',
    kinds: ['circle', 'ring'],
    count: 8,
    size: [4, 18],
    opacity: [0.6, 0.9],
    blur: [0, 0],
    rotation: 0,
  },
  {
    id: 'confetti',
    name: 'Confetti',
    kinds: ['confetti', 'circle', 'triangle', 'square'],
    count: 28,
    size: [2, 4],
    opacity: [0.75, 1],
    blur: [0, 0],
    rotation: 180,
  },
  {
    id: 'geometric',
    name: 'Geometric',
    kinds: ['triangle', 'square', 'half-circle', 'cross', 'ring'],
    count: 9,
    size: [5, 12],
    opacity: [0.75, 1],
    blur: [0, 0],
    rotation: 45,
  },
  {
    id: 'stars',
    name: 'Stars',
    kinds: ['star', 'sparkle'],
    count: 10,
    size: [3, 8],
    opacity: [0.7, 1],
    blur: [0, 0],
    rotation: 30,
  },
  {
    id: 'arches',
    name: 'Arches',
    kinds: ['arch', 'arc', 'half-circle'],
    count: 6,
    size: [10, 22],
    opacity: [0.75, 0.95],
    blur: [0, 0],
    rotation: 0,
  },
  {
    id: 'waves',
    name: 'Waves and squiggles',
    kinds: ['wave', 'squiggle'],
    count: 6,
    size: [10, 20],
    opacity: [0.6, 0.9],
    blur: [0, 0],
    rotation: 25,
  },
] as const satisfies readonly ScatterRecipe[];

export type ScatterRecipeId = (typeof SCATTER_RECIPES)[number]['id'];

function newShape(
  random: Random,
  id: string,
  recipe: ScatterRecipe,
  colors: readonly string[],
  at: ThemePoint,
): ThemeShape {
  const type = random.pick(recipe.kinds);
  return {
    id,
    type,
    ...at,
    size: round1(random.between(...recipe.size)),
    rotation: Math.round(random.between(-recipe.rotation, recipe.rotation)),
    color: random.pick(colors).toUpperCase(),
    opacity: round1(random.between(...recipe.opacity)),
    blur: Math.round(random.between(...recipe.blur)),
    ...(type === 'blob' && { seed: random.int(0, MAX_SEED) }),
  };
}

/** An id not in `taken`: `shape-1`, `shape-2`… */
function freeId(taken: Set<string>): string {
  for (let index = 1; ; index += 1) {
    const id = `shape-${index}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

/** A shapes layer made from a recipe in `colors`, the same for the same seed. */
export function shapesFromRecipe(
  recipe: ScatterRecipe,
  colors: readonly string[],
  seed: number,
  id = 'shapes',
): ShapesLayer {
  const random = seededRandom(seed ^ 0x5f_37_59_df);
  const taken = new Set<string>();
  const positions = scatterPositions(seed, recipe.count);
  return {
    id,
    type: 'shapes',
    opacity: 1,
    blendMode: 'normal',
    seed,
    items: positions.map((at) => newShape(random, freeId(taken), recipe, colors, at)),
  };
}

/** The layer with every shape moved to a new position from `seed`; nothing else changes. */
export function scatterLayer(layer: ShapesLayer, seed: number): ShapesLayer {
  const positions = scatterPositions(seed, layer.items.length);
  return {
    ...layer,
    seed,
    items: layer.items.map((item, index) => ({ ...item, ...positions[index] })),
  };
}

/**
 * The layer with `count` shapes. Extra shapes copy the look of the existing ones in turn and
 * find room away from them; fewer drops shapes from the end. Existing shapes stay put.
 */
export function withShapeCount(layer: ShapesLayer, count: number): ShapesLayer {
  const target = Math.max(1, Math.min(MAX_SHAPES, Math.round(count)));
  const { items } = layer;
  if (target <= items.length) return { ...layer, items: items.slice(0, target) };

  const seed = layer.seed ?? 1;
  const random = seededRandom(seed + items.length);
  const taken = new Set(items.map((item) => item.id));
  const positions = scatterPositions(seed + target, target - items.length, items);
  const added = positions.map((at, index): ThemeShape => {
    const model = items[index % items.length];
    if (!model) throw new Error('A shapes layer has at least one shape');
    return {
      ...model,
      ...at,
      id: freeId(taken),
      rotation: model.rotation === 0 ? 0 : Math.round(random.between(-180, 180)),
      ...(model.seed !== undefined && { seed: random.int(0, MAX_SEED) }),
    };
  });
  return { ...layer, items: [...items, ...added] };
}
