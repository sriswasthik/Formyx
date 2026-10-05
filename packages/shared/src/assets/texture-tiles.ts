import { round1, seededRandom } from '../random.js';
import {
  DEFAULT_TEXTURE_DENSITY,
  getTexture,
  type PatternTextureId,
  type TextureId,
} from './textures.js';

/*
 * The pattern textures, drawn in code as SVG tiles. Only the alpha of a tile is used (the web
 * app draws it as a mask over the tint colour), so everything is drawn in black. Each tile
 * repeats seamlessly: patterns line up at the edges and noise uses `stitchTiles`.
 */

export interface TextureTile {
  /** A complete SVG document, `size` CSS pixels square. */
  svg: string;
  size: number;
  /** Roughly how much of the tile is covered, 0 to 1, for the readability check. */
  coverage: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function svgDocument(size: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;
}

/** A filter that turns noise into alpha: alpha = gain × red + offset. */
function noiseToAlpha(gain: number, offset: number): string {
  return `<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${gain} 0 0 0 ${Math.round(offset * 100) / 100}"/>`;
}

function grain(density: number, size: number): TextureTile {
  const offset = -0.55 + 0.5 * density;
  return {
    size,
    coverage: clamp01(0.05 + 0.3 * density),
    svg: svgDocument(
      size,
      `<filter id="t" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="2" stitchTiles="stitch"/>${noiseToAlpha(1, offset)}</filter><rect width="${size}" height="${size}" filter="url(#t)"/>`,
    ),
  };
}

function dots(density: number, size: number): TextureTile {
  const radius = round1(0.75 + 3.25 * density);
  const half = size / 2;
  return {
    size,
    coverage: (Math.PI * radius * radius) / (size * size),
    svg: svgDocument(size, `<circle cx="${half}" cy="${half}" r="${radius}"/>`),
  };
}

function grid(density: number, size: number): TextureTile {
  const width = round1(0.5 + 1.5 * density);
  const half = width / 2;
  return {
    size,
    coverage: (2 * size * width - width * width) / (size * size),
    svg: svgDocument(
      size,
      `<path d="M0 ${half}H${size}M${half} 0V${size}" fill="none" stroke="#000" stroke-width="${width}" shape-rendering="crispEdges"/>`,
    ),
  };
}

/** Lines at 45° that meet across tile edges; `flip` draws them the other way. */
function diagonalPath(size: number, flip: boolean): string {
  const lines = [
    [-size / 4, size / 4, size / 4, -size / 4],
    [0, size, size, 0],
    [(size * 3) / 4, (size * 5) / 4, (size * 5) / 4, (size * 3) / 4],
  ];
  return lines
    .map(([x1 = 0, y1 = 0, x2 = 0, y2 = 0]) =>
      flip ? `M${size - x1} ${y1}L${size - x2} ${y2}` : `M${x1} ${y1}L${x2} ${y2}`,
    )
    .join('');
}

function diagonal(density: number, size: number, cross: boolean): TextureTile {
  const width = round1(0.75 + 2.25 * density);
  const spacing = size / Math.SQRT2;
  const one = clamp01(width / spacing);
  const path = cross
    ? `${diagonalPath(size, false)}${diagonalPath(size, true)}`
    : diagonalPath(size, false);
  return {
    size,
    coverage: cross ? clamp01(2 * one - one * one) : one,
    svg: svgDocument(
      size,
      `<path d="${path}" fill="none" stroke="#000" stroke-width="${width}" stroke-linecap="square"/>`,
    ),
  };
}

function checker(density: number, size: number): TextureTile {
  const half = size / 2;
  const side = round1(half * (0.55 + 0.45 * density));
  const inset = round1((half - side) / 2);
  return {
    size,
    coverage: (2 * side * side) / (size * size),
    svg: svgDocument(
      size,
      `<rect x="${inset}" y="${inset}" width="${side}" height="${side}"/><rect x="${half + inset}" y="${half + inset}" width="${side}" height="${side}"/>`,
    ),
  };
}

function waves(density: number, size: number): TextureTile {
  const width = round1(0.75 + 2 * density);
  const quarter = size / 4;
  const amplitude = size / 8;
  const row = (y: number) => `M0 ${y}Q${quarter} ${y - amplitude} ${quarter * 2} ${y}T${size} ${y}`;
  return {
    size,
    coverage: clamp01((2 * width * size * 1.1) / (size * size)),
    svg: svgDocument(
      size,
      `<path d="${row(quarter)}${row(quarter * 3)}" fill="none" stroke="#000" stroke-width="${width}"/>`,
    ),
  };
}

/** Contour bands: smooth noise cut into steps, every few steps drawn. */
function topographic(density: number, size: number): TextureTile {
  const every = density < 0.34 ? 6 : density < 0.67 ? 5 : 4;
  const table = Array.from({ length: every * 12 }, (_, index) =>
    index % every === 0 ? 1 : 0,
  ).join(' ');
  return {
    size,
    coverage: 1 / every,
    svg: svgDocument(
      size,
      `<filter id="t" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="1" seed="7" stitchTiles="stitch"/>${noiseToAlpha(1, 0)}<feComponentTransfer><feFuncA type="discrete" tableValues="${table}"/></feComponentTransfer></filter><rect width="${size}" height="${size}" filter="url(#t)"/>`,
    ),
  };
}

/** Short curved fibres over a faint tooth, scattered from a fixed seed so tiles never change. */
function paperFibre(density: number, size: number): TextureTile {
  const random = seededRandom(7);
  const count = Math.round(24 + 72 * density);
  const fibres: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const x = random.between(0, size);
    const y = random.between(0, size);
    const length = random.between(8, 34);
    const angle = random.between(0, Math.PI);
    const bend = random.between(-6, 6);
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    const width = round1(random.between(0.4, 0.9));
    const alpha = round1(random.between(0.35, 0.85));
    // Fibres that cross an edge are drawn again on the far side, so the tile repeats cleanly.
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const sx = x + ox;
        const sy = y + oy;
        const reach = length + 8;
        if (sx < -reach || sx > size + reach || sy < -reach || sy > size + reach) continue;
        fibres.push(
          `<path d="M${round1(sx)} ${round1(sy)}q${round1(dx / 2 - dy * (bend / length))} ${round1(dy / 2 + dx * (bend / length))} ${round1(dx)} ${round1(dy)}" stroke-width="${width}" stroke-opacity="${alpha}"/>`,
        );
      }
    }
  }
  return {
    size,
    coverage: clamp01(0.06 + 0.1 * density),
    svg: svgDocument(
      size,
      `<filter id="t" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="5" stitchTiles="stitch"/>${noiseToAlpha(0.6, -0.22)}</filter><rect width="${size}" height="${size}" filter="url(#t)"/><g fill="none" stroke="#000" stroke-linecap="round">${fibres.join('')}</g>`,
    ),
  };
}

const PATTERNS: Record<PatternTextureId, (density: number, size: number) => TextureTile> = {
  grain,
  dots,
  grid,
  diagonal: (density, size) => diagonal(density, size, false),
  'cross-hatch': (density, size) => diagonal(density, size, true),
  checker,
  waves,
  topographic,
  'paper-fibre': paperFibre,
};

/** Whether a texture is drawn in code, so density applies to it. */
export function isPatternTexture(id: TextureId): id is PatternTextureId {
  return getTexture(id).draw.kind === 'pattern';
}

/** The tile of a pattern texture at a density (0.5 if not given). */
export function textureTile(
  id: PatternTextureId,
  density: number = DEFAULT_TEXTURE_DENSITY,
): TextureTile {
  return PATTERNS[id](clamp01(density), getTexture(id).tileSize);
}

/** Roughly how much of the area a texture covers at a density, 0 to 1. */
export function textureCoverage(id: TextureId, density?: number): number {
  if (isPatternTexture(id)) return textureTile(id, density).coverage;
  const { draw } = getTexture(id);
  return draw.kind === 'photo' ? draw.coverage : 0;
}
