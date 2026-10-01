import { z } from 'zod';

export const FORM_FONTS = ['inter', 'serif', 'rounded'] as const;
export const formFontSchema = z.enum(FORM_FONTS);
export type FormFont = z.infer<typeof formFontSchema>;

export const FORM_RADII = ['sharp', 'rounded'] as const;
export const formRadiusSchema = z.enum(FORM_RADII);
export type FormRadius = z.infer<typeof formRadiusSchema>;

export const FORM_BACKGROUNDS = ['white', 'off_white', 'dark'] as const;
export const formBackgroundSchema = z.enum(FORM_BACKGROUNDS);
export type FormBackground = z.infer<typeof formBackgroundSchema>;

export const FORM_FONT_LABELS: Record<FormFont, string> = {
  inter: 'Inter',
  serif: 'Serif',
  rounded: 'Rounded',
};

export const FORM_RADIUS_LABELS: Record<FormRadius, string> = {
  sharp: 'Sharp',
  rounded: 'Rounded',
};

export const FORM_BACKGROUND_LABELS: Record<FormBackground, string> = {
  white: 'White',
  off_white: 'Off-white',
  dark: 'Dark',
};

/** The colour behind each background choice. */
export const FORM_BACKGROUND_COLORS: Record<FormBackground, string> = {
  white: '#FFFFFF',
  off_white: '#F7F6F3',
  dark: '#18181B',
};

/**
 * Muted accents, each tuned to at least 4.5:1 against white and off-white and 3:1 against
 * the dark background, so every preset stays readable on every background.
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

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const hexColorSchema = z
  .string()
  .regex(HEX_COLOR, 'Use a hex colour such as #4370BD')
  .transform((value) => value.toUpperCase());

const imageUrl = z
  .url({ protocol: /^https$/, error: 'Use an https:// link' })
  .max(2048, 'Use a shorter link');

/**
 * How a form looks. Edited with the draft and copied to `publishedTheme` on publish, so
 * respondents only see a new look once it is published.
 */
export const formThemeSchema = z.object({
  accentColor: hexColorSchema,
  font: formFontSchema,
  radius: formRadiusSchema,
  background: formBackgroundSchema,
  /** Shown above the title. */
  logoUrl: imageUrl.optional(),
  /** A wide image across the top of the form. */
  coverUrl: imageUrl.optional(),
});
export type FormTheme = z.infer<typeof formThemeSchema>;

export function createDefaultTheme(): FormTheme {
  return {
    accentColor: ACCENT_PRESETS[0].color,
    font: 'inter',
    radius: 'rounded',
    background: 'white',
  };
}

export function isSameTheme(a: FormTheme, b: FormTheme): boolean {
  return (
    a.accentColor.toUpperCase() === b.accentColor.toUpperCase() &&
    a.font === b.font &&
    a.radius === b.radius &&
    a.background === b.background &&
    a.logoUrl === b.logoUrl &&
    a.coverUrl === b.coverUrl
  );
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((value) =>
    value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** WCAG AA asks 3:1 for buttons, focus rings and other parts people must see. */
export const ACCENT_MIN_CONTRAST = 3;

/** Whether the accent stands out enough from the form's background (WCAG AA for UI parts). */
export function accentHasEnoughContrast(theme: Pick<FormTheme, 'accentColor' | 'background'>) {
  return (
    contrastRatio(theme.accentColor, FORM_BACKGROUND_COLORS[theme.background]) >=
    ACCENT_MIN_CONTRAST
  );
}
