import { FONT_PAIRINGS } from '../assets/font-pairings.js';
import { contrastRatio, hexToRgb, mixHex, rgbToHex, TEXT_MIN_CONTRAST } from '../color.js';
import { themeReadabilityIssues } from './readability.js';
import type { BackgroundLayer, FormTheme } from './schema.js';
import { ACCENT_PRESETS, buttonTextOn, solidLayer, surfaceColors } from './surfaces.js';

/** One colour of an image's palette, with the share of the image it stands for. */
export interface PaletteColor {
  color: string;
  /** From 0 to 1; a palette's weights add up to 1. */
  weight: number;
}

type Rgb = [number, number, number];

/** Hue (0–360), saturation and lightness (0–1) of a colour. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [red, green, blue] = hexToRgb(hex);
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** Pixels lighter than this in every channel are taken for the logo's background. */
const NEAR_WHITE = 242;
/** Pixels more transparent than this are not part of the logo. */
const MIN_ALPHA = 128;
/** Rounds of k-means after the median cut; enough for logos, which have few colours. */
const KMEANS_PASSES = 6;

/** The channel (0 red, 1 green, 2 blue) with the widest spread in `pixels`, and its spread. */
function widestChannel(pixels: readonly Rgb[]): { channel: 0 | 1 | 2; range: number } {
  let best: { channel: 0 | 1 | 2; range: number } = { channel: 0, range: -1 };
  for (const channel of [0, 1, 2] as const) {
    let min = 255;
    let max = 0;
    for (const pixel of pixels) {
      min = Math.min(min, pixel[channel]);
      max = Math.max(max, pixel[channel]);
    }
    if (max - min > best.range) best = { channel, range: max - min };
  }
  return best;
}

function average(pixels: readonly Rgb[]): Rgb {
  const sum: Rgb = [0, 0, 0];
  for (const [r, g, b] of pixels) {
    sum[0] += r;
    sum[1] += g;
    sum[2] += b;
  }
  return [sum[0] / pixels.length, sum[1] / pixels.length, sum[2] / pixels.length];
}

/**
 * The main colours of an image, most used first: median-cut colour quantization, refined
 * with k-means, over its RGBA pixels (as a canvas's `getImageData` gives them). Transparent
 * pixels and the near-white
 * of a logo's background are left out, unless that is all there is. The same pixels always
 * give the same palette.
 */
export function extractPalette(rgba: ArrayLike<number>, maxColors = 6): PaletteColor[] {
  const opaque: Rgb[] = [];
  const coloured: Rgb[] = [];
  for (let index = 0; index + 3 < rgba.length; index += 4) {
    if ((rgba[index + 3] ?? 0) < MIN_ALPHA) continue;
    const pixel: Rgb = [rgba[index] ?? 0, rgba[index + 1] ?? 0, rgba[index + 2] ?? 0];
    opaque.push(pixel);
    if (pixel.some((channel) => channel < NEAR_WHITE)) coloured.push(pixel);
  }
  const pixels = coloured.length > 0 ? coloured : opaque;
  if (pixels.length === 0) return [];

  // Split the box with the widest spread at its median until there are enough boxes.
  let boxes: Rgb[][] = [pixels];
  while (boxes.length < maxColors) {
    let target = -1;
    let targetRange = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      const { range } = widestChannel(box);
      if (range > targetRange) {
        target = index;
        targetRange = range;
      }
    });
    const box = boxes[target];
    if (!box || targetRange < 8) break;
    const { channel } = widestChannel(box);
    const sorted = [...box].sort((a, b) => a[channel] - b[channel]);
    const middle = Math.floor(sorted.length / 2);
    boxes = [
      ...boxes.slice(0, target),
      sorted.slice(0, middle),
      sorted.slice(middle),
      ...boxes.slice(target + 1),
    ];
  }

  // Median cuts can split a colour between boxes; a few k-means passes settle each pixel
  // with the colour nearest to it.
  const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let clusters = boxes;
  for (let pass = 0; pass < KMEANS_PASSES; pass += 1) {
    const centres = clusters.map(average);
    const next: Rgb[][] = centres.map(() => []);
    for (const pixel of pixels) {
      let nearest = 0;
      centres.forEach((centre, index) => {
        if (distance(pixel, centre) < distance(pixel, centres[nearest] ?? centre)) nearest = index;
      });
      next[nearest]?.push(pixel);
    }
    clusters = next.filter((cluster) => cluster.length > 0);
  }

  // Clusters that came out nearly the same colour count as one.
  const merged: { rgb: Rgb; count: number }[] = [];
  for (const cluster of clusters) {
    const rgb = average(cluster);
    const near = merged.find((existing) => distance(existing.rgb, rgb) < 24);
    if (near) {
      const total = near.count + cluster.length;
      const blend = (channel: 0 | 1 | 2) =>
        (near.rgb[channel] * near.count + rgb[channel] * cluster.length) / total;
      near.rgb = [blend(0), blend(1), blend(2)];
      near.count = total;
    } else {
      merged.push({ rgb, count: cluster.length });
    }
  }

  return merged
    .sort((a, b) => b.count - a.count || rgbToHex(a.rgb).localeCompare(rgbToHex(b.rgb)))
    .map(({ rgb, count }) => ({ color: rgbToHex(rgb), weight: count / pixels.length }));
}

/** The palette's brand colour: the most used colour with some colour to it, or the darkest. */
function brandColor(palette: readonly PaletteColor[]): string {
  const vivid = palette
    .map((entry) => ({ ...entry, ...hexToHsl(entry.color) }))
    .filter(({ s, l }) => s >= 0.25 && l >= 0.12 && l <= 0.88)
    .sort((a, b) => b.weight * (0.4 + b.s) - a.weight * (0.4 + a.s));
  if (vivid[0]) return vivid[0].color;
  const darkest = [...palette].sort((a, b) => hexToHsl(a.color).l - hexToHsl(b.color).l)[0]?.color;
  return darkest ?? ACCENT_PRESETS[0].color;
}

/**
 * `color`, darkened in small steps until it reads as text on `surface` and its button text
 * reads on it, so every button and choice style works.
 */
function readableOn(color: string, surface: string): string {
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mixHex('#000000', color, step * 5);
    if (
      contrastRatio(candidate, surface) >= TEXT_MIN_CONTRAST &&
      contrastRatio(buttonTextOn(candidate), candidate) >= TEXT_MIN_CONTRAST
    ) {
      return candidate;
    }
  }
  return '#18181B';
}

/**
 * A look built around a logo's palette: its brand colour for buttons and selection (dark
 * enough for every button style), a page faintly tinted with it, a soft glow of a second
 * colour where that stays readable, fonts that suit it, and the logo itself. Layout and
 * components stay as `theme` has them.
 */
export function suggestThemeFromPalette(
  theme: FormTheme,
  palette: readonly PaletteColor[],
  logoUrl?: string,
): FormTheme {
  const brand = brandColor(palette);
  const surface = mixHex(brand, '#FFFFFF', 5);
  const primary = readableOn(brand, surface);
  const vivid = hexToHsl(brand).s >= 0.25;
  const pairing =
    FONT_PAIRINGS.find((candidate) => candidate.id === (vivid ? 'friendly' : 'corporate')) ??
    FONT_PAIRINGS[0];

  const accent = palette
    .map((entry) => entry.color)
    .find((color) => color !== brand && hexToHsl(color).s >= 0.2);
  const glow: BackgroundLayer[] = accent
    ? [
        {
          id: 'glow',
          type: 'radial',
          shape: 'ellipse',
          center: { x: 100, y: 0 },
          stops: [
            { color: mixHex(accent, '#FFFFFF', 30), position: 0 },
            { color: surface, position: 60 },
          ],
          opacity: 1,
          blendMode: 'normal',
        },
      ]
    : [];

  const base = surfaceColors(surface);
  // Underlined fields are only their line, which needs 3:1.
  const inputBorder =
    theme.components.inputStyle === 'underline' ? mixHex(base.text, surface, 55) : base.inputBorder;

  const suggestion = (layers: BackgroundLayer[]): FormTheme => ({
    ...theme,
    background: { layers: [solidLayer(surface), ...layers] },
    overlay: { ...theme.overlay, opacity: 0, blur: 0 },
    colors: { ...base, inputBorder, primary, buttonText: buttonTextOn(primary) },
    typography: {
      ...theme.typography,
      headingFont: pairing.headingFont,
      bodyFont: pairing.bodyFont,
      headingWeight: pairing.headingWeight,
    },
    branding: { ...theme.branding, ...(logoUrl !== undefined && { logoUrl }) },
  });

  const withGlow = suggestion(glow);
  return themeReadabilityIssues(withGlow).length === 0 ? withGlow : suggestion([]);
}
