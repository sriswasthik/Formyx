import { z } from 'zod';

export const FORM_FONTS = ['inter', 'system', 'serif', 'mono'] as const;
export const FORM_RADII = ['none', 'small', 'medium', 'large'] as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour such as #2E5AAC');
const imageUrl = z
  .url({ protocol: /^https$/, error: 'Use an https:// link' })
  .max(2048, 'Use a shorter link');

/** How a published form looks. Stored next to the schema, since it never affects answers. */
export const formThemeSchema = z.object({
  accentColor: hexColor,
  font: z.enum(FORM_FONTS),
  radius: z.enum(FORM_RADII),
  background: hexColor,
  logoUrl: imageUrl.optional(),
  coverUrl: imageUrl.optional(),
});
export type FormTheme = z.infer<typeof formThemeSchema>;

export function createDefaultTheme(): FormTheme {
  return { accentColor: '#2E5AAC', font: 'inter', radius: 'medium', background: '#FFFFFF' };
}
