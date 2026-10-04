import { contrastRatio, mixHex, TEXT_MIN_CONTRAST, UI_MIN_CONTRAST } from '../color.js';
import type { FormTheme } from './schema.js';

export type ReadabilityPart = 'text' | 'mutedText' | 'error' | 'primary' | 'button' | 'inputText';

export interface ReadabilityIssue {
  part: ReadabilityPart;
  /** The colour it was checked against. */
  against: string;
  ratio: number;
  minimum: number;
}

/** How strongly a soft button tints its background with the primary colour. */
export const SOFT_BUTTON_TINT = 14;

/** The colour `color` shows as under the overlay. */
function underOverlay(theme: FormTheme, color: string): string {
  const { overlay } = theme;
  return overlay.opacity > 0 ? mixHex(overlay.color, color, overlay.opacity * 100) : color;
}

/** Whether the form's text sits on the container colour rather than on the background. */
export function hasFilledContainer(theme: FormTheme): boolean {
  return (
    theme.layout.mode === 'split' ||
    theme.components.containerStyle === 'card' ||
    theme.components.containerStyle === 'floating'
  );
}

/**
 * The colours text may sit on. In a filled container (or the split layout's form side) that is
 * the container colour. Otherwise it is the background: every solid, gradient-stop and mesh
 * colour, seen through the overlay. Textures, shapes and images are left out (their colours
 * are not known here) and layer opacity is ignored, so this is a close guide rather than a
 * proof; with nothing to go on it falls back to the container colour.
 */
export function textSurfaces(theme: FormTheme): string[] {
  if (hasFilledContainer(theme)) return [theme.colors.containerBackground];
  const colors = theme.background.layers.flatMap((layer) => {
    switch (layer.type) {
      case 'solid':
        return [layer.color];
      case 'linear':
      case 'radial':
        return layer.stops.map((stop) => stop.color);
      case 'mesh':
        return layer.points.map((point) => point.color);
      default:
        return [];
    }
  });
  const seen = colors.length > 0 ? colors : [theme.colors.containerBackground];
  return [...new Set(seen.map((color) => underOverlay(theme, color)))];
}

/**
 * Where a theme falls short of WCAG AA: 4.5:1 for text (including button labels and errors),
 * 3:1 for the primary colour, which marks focus and selection. Built-in presets have none;
 * the editor uses this to warn creators about their own colours.
 */
export function themeReadabilityIssues(theme: FormTheme): ReadabilityIssue[] {
  const { colors, components } = theme;
  const issues: ReadabilityIssue[] = [];
  const check = (part: ReadabilityPart, color: string, against: string, minimum: number) => {
    const ratio = contrastRatio(color, against);
    if (ratio < minimum) issues.push({ part, against, ratio, minimum });
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
  return issues;
}

/** Whether the primary colour stands out from what it sits on (WCAG AA for UI parts). */
export function primaryHasEnoughContrast(theme: FormTheme): boolean {
  return !themeReadabilityIssues(theme).some((issue) => issue.part === 'primary');
}
