import { z } from 'zod';

/** A logo, cover or background image: uploaded through Formyx, so always https. */
export const httpsImageUrlSchema = z
  .url({ protocol: /^https$/, error: 'Use an https:// link' })
  .max(2048, 'Use a shorter link');
