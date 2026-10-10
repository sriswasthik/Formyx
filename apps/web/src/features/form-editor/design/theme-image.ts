import {
  BYTES_PER_MB,
  fileExtension,
  THEME_IMAGE_FORMATS,
  THEME_IMAGE_MAX_MB,
} from '@formyx/shared';

/** What the file pickers for logos, covers and background images offer. */
export const THEME_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/** Why `file` cannot be a theme image, or `null` if it can. */
export function themeImageProblem(file: File): string | null {
  if (!(THEME_IMAGE_FORMATS as readonly string[]).includes(fileExtension(file.name))) {
    return 'Choose a PNG, JPG, WebP or GIF image.';
  }
  if (file.size > THEME_IMAGE_MAX_MB * BYTES_PER_MB) {
    return `This image is too big. The limit is ${THEME_IMAGE_MAX_MB} MB.`;
  }
  if (file.size === 0) return 'This file is empty.';
  return null;
}
