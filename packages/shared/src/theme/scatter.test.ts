import { describe, expect, it } from 'vitest';
import { seededRandom } from '../random.js';
import {
  SCATTER_RECIPES,
  scatterLayer,
  scatterPositions,
  shapesFromRecipe,
  withShapeCount,
} from './scatter.js';
import { backgroundLayerSchema, MAX_SHAPES } from './schema.js';

const COLORS = ['#F4A261', '#2A9D8F', '#E9C46A'];

describe('seededRandom', () => {
  it('gives the same numbers for the same seed', () => {
    const a = seededRandom(5);
    const b = seededRandom(5);
    const first = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(seededRandom(6).next()).not.toBe(first[0]);
  });
});

describe('scatterPositions', () => {
  it('is deterministic and stays inside the area', () => {
    const positions = scatterPositions(11, 20);
    expect(scatterPositions(11, 20)).toEqual(positions);
    expect(scatterPositions(12, 20)).not.toEqual(positions);
    for (const { x, y } of positions) {
      expect(x).toBeGreaterThanOrEqual(4);
      expect(x).toBeLessThanOrEqual(96);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(y).toBeLessThanOrEqual(96);
    }
  });

  it('leans away from the middle, where the text is', () => {
    const positions = scatterPositions(3, 12);
    const middle = positions.filter(({ x }) => x > 28 && x < 72);
    expect(middle.length).toBeLessThan(positions.length / 2);
  });

  it('keeps clear of existing positions', () => {
    const existing = [{ x: 10, y: 10 }];
    const [added] = scatterPositions(3, 1, existing);
    expect(added && Math.hypot(added.x - 10, added.y - 10)).toBeGreaterThan(20);
  });
});

describe.each(SCATTER_RECIPES)('the $name recipe', (recipe) => {
  it('makes a valid, deterministic shapes layer', () => {
    const layer = shapesFromRecipe(recipe, COLORS, 99);
    expect(backgroundLayerSchema.parse(layer)).toEqual(layer);
    expect(shapesFromRecipe(recipe, COLORS, 99)).toEqual(layer);
    expect(shapesFromRecipe(recipe, COLORS, 100)).not.toEqual(layer);
    expect(layer.items).toHaveLength(recipe.count);
    expect(new Set(layer.items.map((item) => item.id)).size).toBe(recipe.count);
    for (const item of layer.items) {
      expect(recipe.kinds).toContain(item.type);
      expect(COLORS).toContain(item.color);
    }
  });
});

describe('scatterLayer', () => {
  it('moves every shape and changes nothing else', () => {
    const layer = shapesFromRecipe(SCATTER_RECIPES[1], COLORS, 1);
    const moved = scatterLayer(layer, 2);
    expect(moved.seed).toBe(2);
    expect(moved).toEqual(scatterLayer(layer, 2));
    moved.items.forEach((item, index) => {
      const { x: _x, y: _y, ...rest } = item;
      const { x: _ox, y: _oy, ...original } = layer.items[index] ?? item;
      expect(rest).toEqual(original);
    });
    expect(moved.items.map(({ x, y }) => [x, y])).not.toEqual(
      layer.items.map(({ x, y }) => [x, y]),
    );
  });
});

describe('withShapeCount', () => {
  const layer = shapesFromRecipe(SCATTER_RECIPES[0], COLORS, 4);

  it('adds shapes like the existing ones, leaving those in place', () => {
    const more = withShapeCount(layer, 9);
    expect(more.items).toHaveLength(9);
    expect(more.items.slice(0, layer.items.length)).toEqual(layer.items);
    expect(new Set(more.items.map((item) => item.id)).size).toBe(9);
    expect(backgroundLayerSchema.parse(more)).toEqual(more);
    expect(withShapeCount(layer, 9)).toEqual(more);
  });

  it('drops shapes from the end and keeps within limits', () => {
    expect(withShapeCount(layer, 2).items).toEqual(layer.items.slice(0, 2));
    expect(withShapeCount(layer, 0).items).toHaveLength(1);
    expect(withShapeCount(layer, 500).items).toHaveLength(MAX_SHAPES);
  });
});
