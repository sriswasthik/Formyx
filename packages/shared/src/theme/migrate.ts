import { z } from 'zod';
import type { FontId } from '../assets/fonts.js';
import { formThemeSchema, THEME_VERSION, type FormTheme } from './schema.js';
import {
  ACCENT_PRESETS,
  buttonTextOn,
  solidLayer,
  surfaceColors,
  SURFACES,
  type SurfaceId,
} from './surfaces.js';
import { formThemeV1Schema, type FormThemeV1 } from './theme-v1.js';

const V1_FONTS: Record<FormThemeV1['font'], FontId> = {
  inter: 'inter',
  serif: 'source-serif-4',
  rounded: 'nunito',
};

const V1_RADII: Record<FormThemeV1['radius'], number> = { sharp: 0, rounded: 10 };

const V1_SURFACES: Record<FormThemeV1['background'], SurfaceId> = {
  white: 'white',
  off_white: 'off_white',
  dark: 'dark',
};

function surfaceColor(id: SurfaceId): string {
  return SURFACES.find((surface) => surface.id === id)?.color ?? '#FFFFFF';
}

const CENTER = { x: 50, y: 50 };

/**
 * A v1 theme as v2, looking the same: one solid layer, the colours v1 derived from its
 * background made explicit, one font for headings and text, and the logo and cover moved to
 * their new places. One change on purpose: on the off-white background, error text turns a
 * shade darker to reach 4.5:1.
 */
export function migrateTheme(v1: FormThemeV1): FormTheme {
  const surface = surfaceColor(V1_SURFACES[v1.background]);
  const font = V1_FONTS[v1.font];
  const primary = v1.accentColor.toUpperCase();

  return {
    version: THEME_VERSION,
    background: { layers: [solidLayer(surface)] },
    overlay: { color: '#000000', opacity: 0, blur: 0 },
    typography: {
      headingFont: font,
      bodyFont: font,
      baseSize: 16,
      headingWeight: 600,
      letterSpacing: 0,
      textAlign: 'left',
      questionNumbering: 'none',
    },
    colors: { primary, buttonText: buttonTextOn(primary), ...surfaceColors(surface) },
    components: {
      inputStyle: 'outlined',
      buttonStyle: 'solid',
      radius: V1_RADII[v1.radius],
      containerStyle: 'none',
      shadow: 'none',
      choiceStyle: 'list',
      buttonSize: 'md',
      buttonFullWidth: false,
      buttonArrow: false,
      containerPadding: 'regular',
    },
    layout: {
      mode: 'classic',
      width: 'regular',
      alignment: 'center',
      logoPosition: 'above_title',
      progress: { style: 'none', position: 'top' },
      autoAdvance: true,
      ...(v1.coverUrl !== undefined && { coverImage: { url: v1.coverUrl, focalPoint: CENTER } }),
    },
    // v1 faded the thank-you message in while moving it up a little.
    motion: { pageTransition: 'slide', animatedBackground: false },
    branding: {
      ...(v1.logoUrl !== undefined && { logoUrl: v1.logoUrl }),
      showFormyxBadge: true,
    },
  };
}

/** The look new forms start with: plain white, Inter, the blue accent. */
export function createDefaultTheme(): FormTheme {
  return migrateTheme({
    accentColor: ACCENT_PRESETS[0].color,
    font: 'inter',
    radius: 'rounded',
    background: 'white',
  });
}

/**
 * A theme as stored or sent by older clients: v2 as is, v1 upgraded with `migrateTheme`.
 * Every read goes through this, so forms work whether or not the data migration
 * (`apps/api/src/scripts/migrate-forms.ts`) has run yet. Validation errors follow v2's paths.
 */
export const storedFormThemeSchema = z.preprocess((value) => {
  const v1 = formThemeV1Schema.safeParse(value);
  return v1.success ? migrateTheme(v1.data) : value;
}, formThemeSchema);

/** Upgrades a stored theme of any version; throws if it is neither a valid v1 nor v2 theme. */
export function upgradeStoredTheme(value: unknown): FormTheme {
  return storedFormThemeSchema.parse(value);
}
