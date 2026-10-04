import { z } from 'zod';
import { hexColorSchema } from '../color.js';
import { httpsImageUrlSchema } from './images.js';

/*
 * Theme v1 (Sprint 7): an accent, three fonts, two corner styles and three backgrounds. Only
 * kept to read forms saved before v2; `migrateTheme` turns it into a v2 theme.
 */

export const THEME_V1_FONTS = ['inter', 'serif', 'rounded'] as const;
export const THEME_V1_RADII = ['sharp', 'rounded'] as const;
export const THEME_V1_BACKGROUNDS = ['white', 'off_white', 'dark'] as const;

export const formThemeV1Schema = z.object({
  accentColor: hexColorSchema,
  font: z.enum(THEME_V1_FONTS),
  radius: z.enum(THEME_V1_RADII),
  background: z.enum(THEME_V1_BACKGROUNDS),
  logoUrl: httpsImageUrlSchema.optional(),
  coverUrl: httpsImageUrlSchema.optional(),
});
export type FormThemeV1 = z.infer<typeof formThemeV1Schema>;
