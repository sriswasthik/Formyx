import { z } from 'zod';
import { fontIdSchema, nearestFontWeight } from './assets/fonts.js';
import { hexColorSchema } from './color.js';
import { httpsImageUrlSchema } from './theme/images.js';
import { themeColorsSchema, type FormTheme } from './theme/schema.js';
import { solidLayer } from './theme/surfaces.js';

export const BRAND_KIT_NAME_MAX_LENGTH = 60;

/**
 * A workspace's brand: logo, colours and fonts, saved from a form's theme and applied to
 * others. The background and layout stay each form's own.
 */
export const brandKitDataSchema = z.object({
  colors: themeColorsSchema,
  /** The colour a form on a plain background takes with the kit, so its text still reads. */
  surface: hexColorSchema,
  headingFont: fontIdSchema,
  bodyFont: fontIdSchema,
  headingWeight: z.number().int().min(300).max(900).multipleOf(100),
  logoUrl: httpsImageUrlSchema.optional(),
});
export type BrandKitData = z.infer<typeof brandKitDataSchema>;

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name')
  .max(BRAND_KIT_NAME_MAX_LENGTH, `Use ${BRAND_KIT_NAME_MAX_LENGTH} characters or fewer`);

/** `POST /api/workspaces/:workspaceId/brand-kits`. */
export const brandKitInputSchema = z.object({ name: nameSchema, kit: brandKitDataSchema });
export type BrandKitInput = z.infer<typeof brandKitInputSchema>;

/** `PATCH /api/workspaces/:workspaceId/brand-kits/:brandKitId`. */
export const brandKitUpdateSchema = z
  .object({ name: nameSchema.optional(), kit: brandKitDataSchema.optional() })
  .refine((patch) => patch.name !== undefined || patch.kit !== undefined, {
    message: 'Change the name or the kit',
  });
export type BrandKitUpdate = z.infer<typeof brandKitUpdateSchema>;

/** `PUT /api/workspaces/:workspaceId/default-brand-kit`: `null` for none. */
export const defaultBrandKitInputSchema = z.object({ brandKitId: z.string().min(1).nullable() });
export type DefaultBrandKitInput = z.infer<typeof defaultBrandKitInputSchema>;

export const brandKitSchema = z.object({
  id: z.string(),
  name: z.string(),
  kit: brandKitDataSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type BrandKit = z.infer<typeof brandKitSchema>;

/** `GET /api/workspaces/:workspaceId/brand-kits`: newest first. */
export const brandKitsResponseSchema = z.object({
  brandKits: z.array(brandKitSchema),
  /** The kit new forms start with, if any. */
  defaultBrandKitId: z.string().nullable(),
});
export type BrandKitsResponse = z.infer<typeof brandKitsResponseSchema>;

/** The one plain colour a theme sits on, if it does: one shown solid layer, no overlay. */
function plainBackground(theme: FormTheme): string | null {
  const shown = theme.background.layers.filter((layer) => !layer.hidden);
  const [layer] = shown;
  if (shown.length !== 1 || layer?.type !== 'solid' || layer.opacity !== 1) return null;
  return theme.overlay.opacity > 0 ? null : layer.color;
}

/** A theme's brand, to save as a kit. */
export function brandKitFromTheme(theme: FormTheme): BrandKitData {
  const { headingFont, bodyFont, headingWeight } = theme.typography;
  return {
    colors: { ...theme.colors },
    surface: plainBackground(theme) ?? theme.colors.containerBackground,
    headingFont,
    bodyFont,
    headingWeight: nearestFontWeight(headingFont, headingWeight),
    ...(theme.branding.logoUrl !== undefined && { logoUrl: theme.branding.logoUrl }),
  };
}

/**
 * `theme` in the kit's brand: its colours, fonts and logo (the form keeps its own logo if
 * the kit has none). A plain background turns the kit's colour; any other background stays,
 * and the readability guard says if the text no longer reads on it.
 */
export function applyBrandKit(theme: FormTheme, kit: BrandKitData): FormTheme {
  const plain = plainBackground(theme) !== null;
  return {
    ...theme,
    ...(plain && { background: { layers: [solidLayer(kit.surface)] } }),
    colors: { ...kit.colors },
    typography: {
      ...theme.typography,
      headingFont: kit.headingFont,
      bodyFont: kit.bodyFont,
      headingWeight: nearestFontWeight(kit.headingFont, kit.headingWeight),
    },
    branding: {
      ...theme.branding,
      ...(kit.logoUrl !== undefined && { logoUrl: kit.logoUrl }),
    },
  };
}
