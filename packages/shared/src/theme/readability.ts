import { textureCoverage } from '../assets/texture-tiles.js';
import { getShape } from '../assets/shapes.js';
import { SOFT_BUTTON_TINT } from './buttons.js';
import {
  contrastRatio,
  hexToRgb,
  mixHex,
  readableTextColor,
  rgbToHex,
  TEXT_MIN_CONTRAST,
  UI_MIN_CONTRAST,
} from '../color.js';
import {
  LAYOUT_WIDTHS_PX,
  type BackgroundLayer,
  type BlendMode,
  type FormTheme,
  type GradientStop,
} from './schema.js';

export type ReadabilityPart = 'text' | 'mutedText' | 'error' | 'primary' | 'button' | 'inputText';

export interface ReadabilityIssue {
  part: ReadabilityPart;
  /** The colour it was checked against: the worst one, where several were. */
  against: string;
  ratio: number;
  minimum: number;
}


/** Whether the form's text sits on the container colour rather than on the background. */
export function hasFilledContainer(theme: FormTheme): boolean {
  return (
    theme.layout.mode === 'split' ||
    theme.components.containerStyle === 'card' ||
    theme.components.containerStyle === 'floating'
  );
}

/*
 * The effective background behind the text. Layers are composited the way the browser draws
 * them (opacity, blend mode, gradient geometry) at points across the column the form's text
 * sits in, on a desktop and a phone screen, then seen through the overlay. Textures count as
 * their tint at their average coverage, shapes where they cover a point, and images as both
 * black and white, since their colours are not known here: so an image needs an overlay or a
 * card. It is a close guide rather than a pixel-perfect proof.
 */

interface Viewport {
  mobile: boolean;
  width: number;
  height: number;
}

const VIEWPORTS: readonly Viewport[] = [
  { mobile: false, width: 1280, height: 800 },
  { mobile: true, width: 390, height: 844 },
];

/** Where text is checked, down the page, in percent. */
const SAMPLE_ROWS = [8, 22, 36, 50, 64, 78, 92];
const SAMPLE_COLUMNS = 5;
/** Space between a phone's edge and its text, in percent of the width. */
const MOBILE_EDGE = 6;
/** Fraction of a filled shape's half-width counted as solid; edges are often soft or round. */
const SHAPE_CORE = 0.75;

/** The left and right edges of the text column, in percent of the width. */
function textColumn(theme: FormTheme, viewport: Viewport): [number, number] {
  if (viewport.mobile) return [MOBILE_EDGE, 100 - MOBILE_EDGE];
  const width = Math.min(90, (LAYOUT_WIDTHS_PX[theme.layout.width] / viewport.width) * 100);
  const gutter = 2;
  switch (theme.layout.alignment) {
    case 'start':
      return [gutter, gutter + width];
    case 'end':
      return [100 - gutter - width, 100 - gutter];
    case 'center':
      return [50 - width / 2, 50 + width / 2];
  }
}

interface Paint {
  color: string;
  alpha: number;
}

/** `top` drawn over `bottom` (source-over), both possibly see-through. */
function over(bottom: Paint, top: Paint): Paint {
  const alpha = top.alpha + bottom.alpha * (1 - top.alpha);
  if (alpha <= 0) return { color: '#000000', alpha: 0 };
  const a = hexToRgb(top.color);
  const b = hexToRgb(bottom.color);
  const channel = (index: 0 | 1 | 2) =>
    (a[index] * top.alpha + b[index] * bottom.alpha * (1 - top.alpha)) / alpha;
  return { color: rgbToHex([channel(0), channel(1), channel(2)]), alpha };
}

/** A colour along gradient stops at `position` percent, as CSS interpolates it. */
function colorAtStop(stops: readonly GradientStop[], position: number): string {
  const first = stops[0];
  const last = stops.at(-1);
  if (!first || !last) return '#FFFFFF';
  if (position <= first.position) return first.color;
  if (position >= last.position) return last.color;
  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1];
    const to = stops[index];
    if (from && to && position <= to.position) {
      const span = to.position - from.position;
      const amount = span === 0 ? 1 : (position - from.position) / span;
      return mixHex(to.color, from.color, amount * 100);
    }
  }
  return last.color;
}

type Channel = (b: number, t: number) => number;

const BLENDS: Partial<Record<BlendMode, Channel>> = {
  multiply: (b, t) => b * t,
  screen: (b, t) => 1 - (1 - b) * (1 - t),
  darken: Math.min,
  lighten: Math.max,
  overlay: (b, t) => (b < 0.5 ? 2 * b * t : 1 - 2 * (1 - b) * (1 - t)),
  'hard-light': (b, t) => (t < 0.5 ? 2 * b * t : 1 - 2 * (1 - b) * (1 - t)),
  'soft-light': (b, t) => (1 - 2 * t) * b * b + 2 * t * b,
  difference: (b, t) => Math.abs(b - t),
  exclusion: (b, t) => b + t - 2 * b * t,
};

/**
 * `top` at `alpha` over an opaque `bottom` in a blend mode. The colour modes (hue, colour…)
 * and dodge and burn count as normal, which is close enough for a guide.
 */
function blend(bottom: string, top: Paint, mode: BlendMode): string {
  if (top.alpha <= 0) return bottom;
  const channel = BLENDS[mode];
  let color = top.color;
  if (channel) {
    const b = hexToRgb(bottom);
    const t = hexToRgb(top.color);
    const mix = (index: 0 | 1 | 2) => channel(b[index] / 255, t[index] / 255) * 255;
    color = rgbToHex([mix(0), mix(1), mix(2)]);
  }
  return mixHex(color, bottom, Math.min(1, top.alpha) * 100);
}

/** CSS `linear-gradient` position (0–100) of a point, `angle` in degrees, 0 pointing up. */
function linearPosition(angle: number, viewport: Viewport, x: number, y: number): number {
  const radians = (angle * Math.PI) / 180;
  const { width, height } = viewport;
  const length = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));
  const dx = ((x - 50) / 100) * width;
  const dy = ((y - 50) / 100) * height;
  const along = dx * Math.sin(radians) - dy * Math.cos(radians);
  return (0.5 + along / length) * 100;
}

/** CSS `radial-gradient(<shape> at cx cy)` position (0–100), sized to the farthest corner. */
function radialPosition(
  shape: 'circle' | 'ellipse',
  center: { x: number; y: number },
  viewport: Viewport,
  x: number,
  y: number,
): number {
  const { width, height } = viewport;
  const cx = (center.x / 100) * width;
  const cy = (center.y / 100) * height;
  const px = (x / 100) * width;
  const py = (y / 100) * height;
  const cornerX = Math.max(cx, width - cx);
  const cornerY = Math.max(cy, height - cy);
  if (shape === 'circle') {
    return (Math.hypot(px - cx, py - cy) / Math.hypot(cornerX, cornerY)) * 100;
  }
  // An ellipse keeps the proportions of its closest-side ellipse while reaching the corner.
  const sideX = Math.min(cx, width - cx);
  const sideY = Math.min(cy, height - cy);
  const ratio = sideX > 0 && sideY > 0 ? sideX / sideY : width / height;
  const radiusY = Math.hypot(cornerX / ratio, cornerY);
  const radiusX = radiusY * ratio;
  return Math.hypot((px - cx) / radiusX, (py - cy) / radiusY) * 100;
}

/**
 * What one layer paints at a point, before its own opacity, or `null` if nothing. `image`
 * stands in for an image's unknown colour.
 */
function paintAt(
  layer: BackgroundLayer,
  theme: FormTheme,
  viewport: Viewport,
  x: number,
  y: number,
  image: string,
): Paint | null {
  switch (layer.type) {
    case 'solid':
      return { color: layer.color, alpha: 1 };
    case 'linear':
      return {
        color: colorAtStop(layer.stops, linearPosition(layer.angle, viewport, x, y)),
        alpha: 1,
      };
    case 'radial':
      return {
        color: colorAtStop(layer.stops, radialPosition(layer.shape, layer.center, viewport, x, y)),
        alpha: 1,
      };
    case 'mesh': {
      // The first gradient is drawn on top, so composite from the last.
      let paint: Paint = { color: '#000000', alpha: 0 };
      for (const point of [...layer.points].reverse()) {
        const distance = Math.hypot((x - point.x) / point.spread, (y - point.y) / point.spread);
        paint = over(paint, { color: point.color, alpha: Math.max(0, 1 - distance) });
      }
      return paint.alpha > 0 ? paint : null;
    }
    case 'texture':
      return {
        color: layer.tint ?? theme.colors.text,
        alpha: textureCoverage(layer.assetId, layer.density),
      };
    case 'shapes': {
      if (viewport.mobile && layer.hideOnMobile) return null;
      let paint: Paint = { color: '#000000', alpha: 0 };
      for (const item of layer.items) {
        // Lines are thin enough to read across.
        if (getShape(item.type).draw.kind === 'stroke') continue;
        const radius = ((item.size / 100) * viewport.width * SHAPE_CORE) / 2;
        const dx = ((x - item.x) / 100) * viewport.width;
        const dy = ((y - item.y) / 100) * viewport.height;
        if (Math.hypot(dx, dy) <= radius) {
          paint = over(paint, { color: item.color, alpha: item.opacity });
        }
      }
      return paint.alpha > 0 ? paint : null;
    }
    case 'image':
      return { color: image, alpha: 1 };
  }
}

/** The theme's layers that are drawn. */
export function visibleLayers(theme: FormTheme): BackgroundLayer[] {
  return theme.background.layers.filter((layer) => !layer.hidden && layer.opacity > 0);
}

/** Whether a visible image layer is in the background. */
export function hasImageBackground(theme: FormTheme): boolean {
  return visibleLayers(theme).some((layer) => layer.type === 'image');
}

/** The colour the page shows at a point, through the overlay. */
function colorAt(
  theme: FormTheme,
  viewport: Viewport,
  x: number,
  y: number,
  image: string,
): string {
  // Under every layer is the container colour, which the page falls back to.
  let color = theme.colors.containerBackground;
  for (const layer of visibleLayers(theme)) {
    const paint = paintAt(layer, theme, viewport, x, y, image);
    if (paint) {
      color = blend(color, { ...paint, alpha: paint.alpha * layer.opacity }, layer.blendMode);
    }
  }
  const { overlay } = theme;
  return overlay.opacity > 0 ? mixHex(overlay.color, color, overlay.opacity * 100) : color;
}

/**
 * The colours the form's text may sit on. In a filled container (or the split layout's form
 * side) that is the container colour; otherwise the composited background at points across
 * the text column.
 */
export function textSurfaces(theme: FormTheme): string[] {
  if (hasFilledContainer(theme)) return [theme.colors.containerBackground];
  const images = hasImageBackground(theme) ? ['#000000', '#FFFFFF'] : ['#000000'];
  const colors = new Set<string>();
  for (const viewport of VIEWPORTS) {
    const [left, right] = textColumn(theme, viewport);
    for (let column = 0; column < SAMPLE_COLUMNS; column += 1) {
      const x = left + ((right - left) * column) / (SAMPLE_COLUMNS - 1);
      for (const y of SAMPLE_ROWS) {
        for (const image of images) colors.add(colorAt(theme, viewport, x, y, image));
      }
    }
  }
  return [...colors];
}

/**
 * Where a theme falls short of WCAG AA: 4.5:1 for text (including button labels and errors),
 * 3:1 for the primary colour, which marks focus and selection. One issue per part, against
 * the colour it fares worst on. Built-in presets have none; the Design Studio warns creators
 * about their own looks and offers fixes (see `readabilityFixes`).
 */
export function themeReadabilityIssues(theme: FormTheme): ReadabilityIssue[] {
  const { colors, components } = theme;
  const worst = new Map<ReadabilityPart, ReadabilityIssue>();
  const check = (part: ReadabilityPart, color: string, against: string, minimum: number) => {
    const ratio = contrastRatio(color, against);
    const current = worst.get(part);
    if (ratio < minimum && (!current || ratio < current.ratio)) {
      worst.set(part, { part, against, ratio, minimum });
    }
  };

  for (const surface of textSurfaces(theme)) {
    check('text', colors.text, surface, TEXT_MIN_CONTRAST);
    check('mutedText', colors.mutedText, surface, TEXT_MIN_CONTRAST);
    check('error', colors.error, surface, TEXT_MIN_CONTRAST);
    check('primary', colors.primary, surface, UI_MIN_CONTRAST);
    if (components.buttonStyle === 'outline') {
      check('button', colors.primary, surface, TEXT_MIN_CONTRAST);
    } else if (components.buttonStyle === 'soft') {
      check(
        'button',
        colors.primary,
        mixHex(colors.primary, surface, SOFT_BUTTON_TINT),
        TEXT_MIN_CONTRAST,
      );
    }
  }
  if (components.buttonStyle === 'solid' || components.buttonStyle === 'pill') {
    check('button', colors.buttonText, colors.primary, TEXT_MIN_CONTRAST);
  }
  // Underlined and minimal inputs have no fill of their own: their text is checked above.
  if (components.inputStyle !== 'underline' && components.inputStyle !== 'minimal') {
    check('inputText', colors.text, colors.inputBackground, TEXT_MIN_CONTRAST);
  }
  const order: ReadabilityPart[] = ['text', 'mutedText', 'error', 'primary', 'button', 'inputText'];
  return order.flatMap((part) => worst.get(part) ?? []);
}

/** Whether the primary colour stands out from what it sits on (WCAG AA for UI parts). */
export function primaryHasEnoughContrast(theme: FormTheme): boolean {
  return !themeReadabilityIssues(theme).some((issue) => issue.part === 'primary');
}

/** The parts the text fixes are about: reading the questions, hints and errors. */
const TEXT_PARTS: readonly ReadabilityPart[] = ['text', 'mutedText', 'error', 'inputText'];

export function hasTextIssues(issues: readonly ReadabilityIssue[]): boolean {
  return issues.some((issue) => TEXT_PARTS.includes(issue.part));
}

export type ReadabilityFixId = 'overlay' | 'card' | 'text_color';

export interface ReadabilityFix {
  id: ReadabilityFixId;
  label: string;
  description: string;
  theme: FormTheme;
}

/** The overlay colour that suits the text: the container colour if the text reads on it. */
function overlayColorFor(theme: FormTheme): string {
  const { text, containerBackground } = theme.colors;
  if (contrastRatio(text, containerBackground) >= TEXT_MIN_CONTRAST) return containerBackground;
  return readableTextColor(text, '#000000', '#FFFFFF');
}

/**
 * Hint and error colours that read on every surface, keeping the ones that already do. Hints
 * mix back from the text as far as they can.
 */
function withReadableSecondaryText(theme: FormTheme, recompute = false): FormTheme {
  const surfaces = textSurfaces(theme);
  const { text, mutedText, error } = theme.colors;
  const reads = (color: string) =>
    surfaces.every((surface) => contrastRatio(color, surface) >= TEXT_MIN_CONTRAST);
  const dark = readableTextColor(text, '#18181B', '#FFFFFF') === '#FFFFFF';
  const middle = surfaces[Math.floor(surfaces.length / 2)] ?? theme.colors.containerBackground;
  return {
    ...theme,
    colors: {
      ...theme.colors,
      mutedText:
        reads(mutedText) && !recompute
          ? mutedText
          : firstReadable(
              [64, 70, 76, 82, 88, 94].map((percent) => mixHex(text, middle, percent)).concat(text),
              surfaces,
            ),
      error:
        reads(error) && !recompute
          ? error
          : firstReadable(
              dark
                ? ['#DC2626', '#B91C1C', '#991B1B', '#7F1D1D']
                : ['#F87171', '#FCA5A5', '#FECACA'],
              surfaces,
            ),
    },
  };
}

/**
 * The lightest overlay, in steps of 5%, that makes the text readable; `null` if none does. If
 * no overlay is enough on its own, hints and errors darken (or lighten) a little with it.
 */
export function withOverlayFix(theme: FormTheme): FormTheme | null {
  const color = overlayColorFor(theme);
  const start = theme.overlay.color === color ? theme.overlay.opacity : 0;
  const candidates: FormTheme[] = [];
  for (let step = Math.ceil(start * 20) + 1; step <= 18; step += 1) {
    candidates.push({ ...theme, overlay: { ...theme.overlay, color, opacity: step / 20 } });
  }
  const readable = (candidate: FormTheme) => !hasTextIssues(themeReadabilityIssues(candidate));
  return (
    candidates.find(readable) ??
    candidates.map((candidate) => withReadableSecondaryText(candidate)).find(readable) ??
    null
  );
}

/** The form in a card of a colour its text reads on. */
export function withCardFix(theme: FormTheme): FormTheme {
  const { text, containerBackground } = theme.colors;
  const readable = contrastRatio(text, containerBackground) >= TEXT_MIN_CONTRAST;
  return {
    ...theme,
    components: { ...theme.components, containerStyle: 'card' },
    colors: {
      ...theme.colors,
      containerBackground: readable
        ? containerBackground
        : readableTextColor(text, '#18181B', '#FFFFFF'),
    },
  };
}

/** The first colour of `candidates` that reads on every surface, or the last one. */
function firstReadable(candidates: readonly string[], surfaces: readonly string[]): string {
  return (
    candidates.find((color) =>
      surfaces.every((surface) => contrastRatio(color, surface) >= TEXT_MIN_CONTRAST),
    ) ??
    candidates.at(-1) ??
    '#000000'
  );
}

/**
 * Text, hint and error colours that read on the background: near-black or near-white if
 * either reads everywhere, otherwise whichever of black and white does best on the worst
 * surface. Hints and errors follow it.
 */
export function withTextColorFix(theme: FormTheme): FormTheme {
  const surfaces = textSurfaces(theme);
  const worstFor = (color: string) =>
    Math.min(...surfaces.map((surface) => contrastRatio(color, surface)));
  const text =
    ['#18181B', '#FAFAFA'].find((color) => worstFor(color) >= TEXT_MIN_CONTRAST) ??
    ['#000000', '#FFFFFF'].reduce((best, color) =>
      worstFor(color) > worstFor(best) ? color : best,
    );
  const dark = text === '#18181B' || text === '#000000';
  const inputReadable = contrastRatio(text, theme.colors.inputBackground) >= TEXT_MIN_CONTRAST;
  const inputBackground = inputReadable
    ? theme.colors.inputBackground
    : dark
      ? '#FFFFFF'
      : '#18181B';
  return withReadableSecondaryText(
    {
      ...theme,
      colors: {
        ...theme.colors,
        text,
        inputBackground,
        inputBorder: inputReadable ? theme.colors.inputBorder : mixHex(text, inputBackground, 26),
      },
    },
    text !== theme.colors.text,
  );
}

/**
 * One-click ways to make the text readable, best first: each is offered only if it clears
 * every text issue. Empty when the text already reads well.
 */
export function readabilityFixes(theme: FormTheme): ReadabilityFix[] {
  if (!hasTextIssues(themeReadabilityIssues(theme))) return [];
  const fixes: ReadabilityFix[] = [];
  const overlay = withOverlayFix(theme);
  if (overlay) {
    fixes.push({
      id: 'overlay',
      label: 'Add an overlay',
      description: `A ${Math.round(overlay.overlay.opacity * 100)}% wash over the background.`,
      theme: overlay,
    });
  }
  if (!hasFilledContainer(theme)) {
    const card = withCardFix(theme);
    if (!hasTextIssues(themeReadabilityIssues(card))) {
      fixes.push({
        id: 'card',
        label: 'Put the form in a card',
        description: 'The background stays as it is around a solid card.',
        theme: card,
      });
    }
  }
  const text = withTextColorFix(theme);
  if (!hasTextIssues(themeReadabilityIssues(text))) {
    fixes.push({
      id: 'text_color',
      label: 'Adjust the text colour',
      description: 'Text, hints and errors in colours that read on this background.',
      theme: text,
    });
  }
  return fixes;
}
