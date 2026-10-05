import { round1, seededRandom, type Random } from '../random.js';
import {
  MESH_MAX_POINTS,
  MESH_MIN_POINTS,
  type BackgroundLayer,
  type MeshPoint,
} from './schema.js';

export type MeshLayer = Extract<BackgroundLayer, { type: 'mesh' }>;

/**
 * Where point `index` of `count` goes: round a loose ring (turned by `turn`), jittered, so the
 * colours frame the form; with five or more, the last one sits near the middle.
 */
function placePoint(index: number, count: number, turn: number, random: Random) {
  const ring = count >= 5 ? count - 1 : count;
  const inner = index >= ring;
  const angle = (index / ring) * Math.PI * 2 + turn;
  const radius = inner ? random.between(0, 18) : random.between(38, 52);
  const x = 50 + Math.cos(angle) * radius + random.between(-8, 8);
  const y = 50 + Math.sin(angle) * radius + random.between(-8, 8);
  return {
    x: round1(Math.min(100, Math.max(0, x))),
    y: round1(Math.min(100, Math.max(0, y))),
    spread: Math.round(inner ? random.between(30, 45) : random.between(45, 70)),
  };
}

/** The same colours in new places and spreads, the same for the same seed. */
export function shuffleMesh(points: readonly MeshPoint[], seed: number): MeshPoint[] {
  const random = seededRandom(seed);
  // Shuffle the colours too, so the same palette lands differently.
  const colors = points.map((point) => point.color);
  for (let index = colors.length - 1; index > 0; index -= 1) {
    const other = random.int(0, index);
    [colors[index], colors[other]] = [colors[other] ?? '', colors[index] ?? ''];
  }
  const turn = random.between(0, Math.PI * 2);
  return colors.map((color, index) => ({
    ...placePoint(index, colors.length, turn, random),
    color,
  }));
}

/** Mesh points in a palette's colours, the same for the same seed. */
export function meshFromPalette(
  colors: readonly string[],
  seed: number,
  count = Math.min(MESH_MAX_POINTS, Math.max(MESH_MIN_POINTS, colors.length)),
): MeshPoint[] {
  const random = seededRandom(seed);
  const turn = random.between(0, Math.PI * 2);
  return Array.from({ length: count }, (_, index) => ({
    ...placePoint(index, count, turn, random),
    color: (colors[index % colors.length] ?? '#FFFFFF').toUpperCase(),
  }));
}

/** The mesh with one more point, in the middle of the largest gap, while there is room. */
export function withAddedMeshPoint(points: readonly MeshPoint[], color: string): MeshPoint[] {
  if (points.length >= MESH_MAX_POINTS) return [...points];
  let best = { x: 50, y: 50 };
  let bestDistance = -1;
  for (let x = 10; x <= 90; x += 10) {
    for (let y = 10; y <= 90; y += 10) {
      const nearest = Math.min(...points.map((point) => Math.hypot(point.x - x, point.y - y)));
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = { x, y };
      }
    }
  }
  return [...points, { ...best, color: color.toUpperCase(), spread: 45 }];
}
