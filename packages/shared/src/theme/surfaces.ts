import { contrastRatio, mixHex, readableTextColor, TEXT_MIN_CONTRAST } from '../color.js';
import type { BackgroundLayer, FormTheme, ThemeColors } from './schema.js';

/** Plain backgrounds offered in the design panel. */
export const SURFACES = [
  { id: 'white', label: 'White', color: '#FFFFFF' },
  { id: 'off_white', label: 'Off-white', color: '#F7F6F3' },
  { id: 'dark', label: 'Dark', color: '#18181B' },
] as const;
export type SurfaceId = (typeof SURFACES)[number]['id'];

/**
 * Muted accents, each tuned to at least 4.5:1 against the light surfaces and 3:1 against the
 * dark one, so every preset stays readable on every surface.
 */
export const ACCENT_PRESETS = [
  { id: 'blue', label: 'Blue', color: '#4370BD' },
  { id: 'teal', label: 'Teal', color: '#337B7E' },
  { id: 'green', label: 'Green', color: '#417D57' },
  { id: 'ochre', label: 'Ochre', color: '#8F6A2A' },
  { id: 'rust', label: 'Rust', color: '#B1563B' },
  { id: 'rose', label: 'Rose', color: '#B15171' },
  { id: 'slate', label: 'Slate', color: '#61728B' },
  { id: 'graphite', label: 'Graphite', color: '#70707C' },
] as const;

const DARK_TEXT = '#18181B';
const LIGHT_TEXT = '#FAFAFA';

/** The first red that reads as text on `surface`: red-600 where it can, darker where not. */
function errorColorOn(surface: string, dark: boolean): string {
  const candidates = dark ? ['#F87171', '#FCA5A5'] : ['#DC2626', '#B91C1C', '#991B1B'];
  return (
    candidates.find((color) => contrastRatio(color, surface) >= TEXT_MIN_CONTRAST) ??
    candidates.at(-1) ??
    '#DC2626'
  );
}

/** Text on `primary`: near-black or white, whichever reads better. */
export function buttonTextOn(primary: string): string {
  return readableTextColor(primary, DARK_TEXT, '#FFFFFF');
}

/**
 * The colours that follow from a form sitting on one plain colour: text in near-black or
 * near-white, muted text and input borders mixed from it, inputs and container on the
 * surface itself.
 */
export function surfaceColors(surface: string): Omit<ThemeColors, 'primary' | 'buttonText'> {
  const text = readableTextColor(surface, DARK_TEXT, LIGHT_TEXT);
  return {
    text,
    mutedText: mixHex(text, surface, 64),
    containerBackground: surface.toUpperCase(),
    inputBackground: surface.toUpperCase(),
    inputBorder: mixHex(text, surface, 26),
    error: errorColorOn(surface, text === LIGHT_TEXT),
  };
}

export function solidLayer(color: string, id = 'base'): BackgroundLayer {
  return { id, type: 'solid', color: color.toUpperCase(), opacity: 1, blendMode: 'normal' };
}

/** The theme with a new primary colour, and button text that reads on it. */
export function withPrimaryColor(theme: FormTheme, primary: string): FormTheme {
  const color = primary.toUpperCase();
  return { ...theme, colors: { ...theme.colors, primary: color, buttonText: buttonTextOn(color) } };
}

/** The theme on one plain colour: other layers and the overlay go, colours follow it. */
export function withSurface(theme: FormTheme, surface: string): FormTheme {
  return {
    ...theme,
    background: { layers: [solidLayer(surface)] },
    overlay: { ...theme.overlay, opacity: 0, blur: 0 },
    colors: { ...theme.colors, ...surfaceColors(surface) },
  };
}

/** Which of `SURFACES` the theme sits on, if it is one plain colour without an overlay. */
export function matchingSurface(theme: FormTheme): SurfaceId | null {
  const [layer, ...rest] = theme.background.layers;
  if (!layer || rest.length > 0 || layer.type !== 'solid' || layer.opacity !== 1) return null;
  if (theme.overlay.opacity > 0) return null;
  return SURFACES.find((surface) => surface.color === layer.color)?.id ?? null;
}
