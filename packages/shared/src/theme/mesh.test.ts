import { describe, expect, it } from 'vitest';
import { GRADIENT_PALETTES } from '../assets/palettes.js';
import { meshFromPalette, shuffleMesh, withAddedMeshPoint } from './mesh.js';
import { backgroundLayerSchema, MESH_MAX_POINTS, type MeshPoint } from './schema.js';

const asLayer = (points: MeshPoint[]) =>
  backgroundLayerSchema.parse({
    id: 'mesh',
    type: 'mesh',
    opacity: 1,
    blendMode: 'normal',
    points,
  });

describe('meshFromPalette', () => {
  it.each(GRADIENT_PALETTES)('makes a valid mesh from $name', (palette) => {
    const points = meshFromPalette(palette.colors, 8);
    expect(asLayer(points)).toMatchObject({ points });
    expect(points.map((point) => point.color)).toEqual(
      palette.colors.slice(0, points.length).map((color) => color.toUpperCase()),
    );
  });

  it('is deterministic', () => {
    const colors = GRADIENT_PALETTES[0].colors;
    expect(meshFromPalette(colors, 1)).toEqual(meshFromPalette(colors, 1));
    expect(meshFromPalette(colors, 1)).not.toEqual(meshFromPalette(colors, 2));
  });
});

describe('shuffleMesh', () => {
  it('keeps the colours and moves the points, the same way for the same seed', () => {
    const points = meshFromPalette(GRADIENT_PALETTES[1].colors, 3);
    const shuffled = shuffleMesh(points, 10);
    expect(shuffled).toEqual(shuffleMesh(points, 10));
    expect(shuffled).not.toEqual(points);
    expect(shuffled.map((point) => point.color).sort()).toEqual(
      points.map((point) => point.color).sort(),
    );
    expect(asLayer(shuffled)).toMatchObject({ points: shuffled });
  });
});

describe('withAddedMeshPoint', () => {
  it('adds a point in the largest gap, up to the limit', () => {
    const corners = [
      { x: 0, y: 0, color: '#FFFFFF', spread: 50 },
      { x: 100, y: 0, color: '#FFFFFF', spread: 50 },
      { x: 0, y: 100, color: '#FFFFFF', spread: 50 },
      { x: 100, y: 100, color: '#FFFFFF', spread: 50 },
    ];
    expect(withAddedMeshPoint(corners, '#abcdef').at(-1)).toEqual({
      x: 50,
      y: 50,
      color: '#ABCDEF',
      spread: 45,
    });
    const full = meshFromPalette(GRADIENT_PALETTES[0].colors, 1, MESH_MAX_POINTS);
    expect(withAddedMeshPoint(full, '#000000')).toHaveLength(MESH_MAX_POINTS);
  });
});
