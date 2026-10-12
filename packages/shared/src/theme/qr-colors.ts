import { contrastRatio, relativeLuminance } from '../color.js';
import type { ThemeColors } from './schema.js';

/*
 * A QR code in a form's colours, for posters and print. Scanners need dark modules on a light
 * ground with strong contrast, so the form's colours are used only when they give it; plain
 * dark on white otherwise.
 */

export interface QrColors {
  dark: string;
  light: string;
}

export const PLAIN_QR_COLORS: QrColors = { dark: '#18181b', light: '#ffffff' };

/** Below this, some phone cameras struggle to read a code. */
const QR_MIN_CONTRAST = 7;

export function qrCodeColors(
  colors: Pick<ThemeColors, 'primary' | 'text' | 'containerBackground'>,
): QrColors {
  // A light ground: the form's container if it is light, white otherwise.
  const light =
    relativeLuminance(colors.containerBackground) >= 0.7 ? colors.containerBackground : '#ffffff';
  const dark = [colors.primary, colors.text].find(
    (candidate) => contrastRatio(candidate, light) >= QR_MIN_CONTRAST,
  );
  return dark ? { dark, light } : { ...PLAIN_QR_COLORS, light };
}
