import { FONT_CATEGORIES, FONTS, type FontCategory } from '@formyx/shared';

export type FontFilter = FontCategory | 'all';
export const FONT_FILTERS: readonly FontFilter[] = ['all', ...FONT_CATEGORIES];

/** Fonts whose name matches `query` (any case, ignoring spaces), in `category`. */
export function filterFonts(query: string, category: FontFilter) {
  const needle = query.toLowerCase().replace(/\s+/g, '');
  return FONTS.filter(
    (font) =>
      (category === 'all' || font.category === category) &&
      font.name.toLowerCase().replace(/\s+/g, '').includes(needle),
  );
}
