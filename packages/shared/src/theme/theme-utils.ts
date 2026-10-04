import { isSameJson } from '../json.js';
import type { FormTheme } from './schema.js';

/** Whether two themes look the same. Hex colours are stored in capitals, so compare as is. */
export function isSameTheme(a: FormTheme, b: FormTheme): boolean {
  return isSameJson(a, b);
}

/** Every image a theme shows: logo, cover and image layers. Uploads are checked before use. */
export function themeImageUrls(theme: FormTheme): string[] {
  const urls = [
    theme.branding.logoUrl,
    theme.layout.coverImage?.url,
    ...theme.background.layers.map((layer) => (layer.type === 'image' ? layer.url : undefined)),
  ];
  return [...new Set(urls.filter((url) => url !== undefined))];
}
