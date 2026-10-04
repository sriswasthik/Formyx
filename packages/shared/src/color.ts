import { z } from 'zod';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** A six-digit hex colour, stored in capitals so equal colours compare equal. */
export const hexColorSchema = z
  .string()
  .regex(HEX_COLOR, 'Use a hex colour such as #4370BD')
  .transform((value) => value.toUpperCase());

/** `#2E5AAC` -> `[46, 90, 172]`. Expects six-digit hex. */
export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** `[46, 90, 172]` -> `#2E5AAC`. */
export function rgbToHex(rgb: readonly [number, number, number]): string {
  return `#${rgb
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();
}

/**
 * `percent` of `a` over `b`, like CSS `color-mix(in srgb, a percent%, b)`. Also how a colour at
 * `percent`% opacity looks on top of `b`.
 */
export function mixHex(a: string, b: string, percent: number): string {
  const weight = percent / 100;
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex([
    ar * weight + br * (1 - weight),
    ag * weight + bg * (1 - weight),
    ab * weight + bb * (1 - weight),
  ]);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** WCAG contrast ratio between two hex colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** Whichever of `dark` and `light` reads better on `background`. */
export function readableTextColor(background: string, dark = '#18181B', light = '#FFFFFF'): string {
  return contrastRatio(background, dark) >= contrastRatio(background, light) ? dark : light;
}

/** WCAG AA: 4.5:1 for text. */
export const TEXT_MIN_CONTRAST = 4.5;
/** WCAG AA: 3:1 for buttons, focus rings and other parts people must see. */
export const UI_MIN_CONTRAST = 3;
