/* eslint-disable no-console -- a command-line tool: it prints what it wrote. */
// Renders the photo textures (paper, linen, concrete) to apps/web/public/textures/*.webp.
// They are made here, from seeded noise, so they are ours to give away: CC0-1.0, recorded in
// the texture registry. Each tile is greyscale and opaque: the app draws it as a luminance mask
// over a tint colour (white shows the tint, black hides it), which compresses far better than
// an alpha channel. Every tile repeats seamlessly. Prints each tile's average brightness, which
// the registry keeps as `coverage` for the readability check.
// Usage: pnpm --filter @formyx/e2e render:textures
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const output = join(import.meta.dirname, '..', '..', 'apps', 'web', 'public', 'textures');
const SIZE = 512;
const QUALITY = 0.72;

/** Runs in the page: draws one texture and returns it as a WebP data URL and its coverage. */
function renderTexture({ kind, size, quality }) {
  let state = { paper: 11, linen: 23, concrete: 37 }[kind] >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** Value noise that repeats every `period` lattice cells, so the tile wraps cleanly. */
  const lattice = (period) => {
    const values = Array.from({ length: period * period }, random);
    const at = (x, y) =>
      values[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
    const smooth = (t) => t * t * (3 - 2 * t);
    return (u, v) => {
      const x = u * period;
      const y = v * period;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const sx = smooth(x - x0);
      const sy = smooth(y - y0);
      const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
      const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
      return top * (1 - sy) + bottom * sy;
    };
  };
  const fbm = (periods) => {
    const layers = periods.map((period) => lattice(period));
    return (u, v) => {
      let sum = 0;
      let weight = 0;
      layers.forEach((layer, index) => {
        const w = 1 / 2 ** index;
        sum += layer(u, v) * w;
        weight += w;
      });
      return sum / weight;
    };
  };

  const ink = new Float32Array(size * size);
  const add = (x, y, value) => {
    const wx = ((Math.round(x) % size) + size) % size;
    const wy = ((Math.round(y) % size) + size) % size;
    ink[wy * size + wx] += value;
  };

  if (kind === 'paper') {
    const mottle = fbm([4, 8, 16]);
    const tooth = fbm([128, 256]);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const v = y / size;
        ink[y * size + x] = 0.22 * mottle(u, v) + 0.28 * (tooth(u, v) - 0.35);
      }
    }
    // Fibres: short, faint curves.
    for (let index = 0; index < 420; index += 1) {
      let x = random() * size;
      let y = random() * size;
      let angle = random() * Math.PI * 2;
      const length = 6 + random() * 26;
      const strength = 0.05 + random() * 0.1;
      for (let step = 0; step < length; step += 0.5) {
        angle += (random() - 0.5) * 0.15;
        x += Math.cos(angle) * 0.5;
        y += Math.sin(angle) * 0.5;
        add(x, y, strength);
      }
    }
  } else if (kind === 'linen') {
    const slub = fbm([8, 32]);
    const wobble = fbm([16]);
    // A whole, even number of threads, so the weave wraps at the tile edge.
    const threads = size / 8;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const v = y / size;
        const weft = 0.5 + 0.5 * Math.sin(2 * Math.PI * (v * threads + 0.6 * wobble(u, v)));
        const warp = 0.5 + 0.5 * Math.sin(2 * Math.PI * (u * threads + 0.6 * wobble(v, u)));
        // Over-under: threads alternate which one lies on top.
        const over = (Math.floor(u * threads) + Math.floor(v * threads)) % 2 === 0;
        const weave = over ? 0.65 * weft + 0.35 * warp : 0.35 * weft + 0.65 * warp;
        ink[y * size + x] = 0.5 * weave ** 3 + 0.2 * (slub(u, v) - 0.4);
      }
    }
  } else {
    const cloud = fbm([4, 8, 16, 32]);
    const grit = fbm([128, 256]);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const v = y / size;
        ink[y * size + x] = 0.38 * (cloud(u, v) - 0.25) + 0.3 * (grit(u, v) - 0.4);
      }
    }
    // Pits and aggregate: small soft specks.
    for (let index = 0; index < 1400; index += 1) {
      const cx = random() * size;
      const cy = random() * size;
      const radius = 0.6 + random() ** 3 * 3.5;
      const strength = 0.15 + random() * 0.35;
      for (let dy = -4; dy <= 4; dy += 1) {
        for (let dx = -4; dx <= 4; dx += 1) {
          const d = Math.hypot(dx, dy);
          if (d <= radius) add(cx + dx, cy + dy, strength * (1 - d / (radius + 1)));
        }
      }
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  let total = 0;
  for (let index = 0; index < ink.length; index += 1) {
    const value = Math.min(1, Math.max(0, ink[index]));
    total += value;
    const level = Math.round(value * 255);
    image.data[index * 4] = level;
    image.data[index * 4 + 1] = level;
    image.data[index * 4 + 2] = level;
    image.data[index * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return { url: canvas.toDataURL('image/webp', quality), coverage: total / ink.length };
}

const browser = await chromium.launch();
const page = await browser.newPage();
for (const kind of ['paper', 'linen', 'concrete']) {
  const { url, coverage } = await page.evaluate(renderTexture, {
    kind,
    size: SIZE,
    quality: QUALITY,
  });
  const bytes = Buffer.from(url.replace(/^data:image\/webp;base64,/, ''), 'base64');
  writeFileSync(join(output, `${kind}.webp`), bytes);
  console.log(
    `apps/web/public/textures/${kind}.webp  ${(bytes.length / 1024).toFixed(1)} KB  coverage ${coverage.toFixed(2)}`,
  );
}
await browser.close();
