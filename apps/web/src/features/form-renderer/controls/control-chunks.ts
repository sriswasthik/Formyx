import type { FieldType } from '@formyx/shared';

/*
 * Which chunk draws each question type, apart from the code that loads them (registry.ts), so
 * the build can read it too: index.html preloads a public form's chunks as soon as the form
 * arrives (see build/form-asset-preload.ts).
 */

/** Each chunk's module, in this folder. */
export const CONTROL_MODULES = {
  choices: 'choice-extra',
  slider: 'slider-control',
  ranking: 'ranking-control',
  matrix: 'matrix-control',
  address: 'address-control',
  inputs: 'input-extra',
  signature: 'signature-control',
  voice: 'voice-control',
  file: 'file-chunk',
  blocks: 'content-blocks',
} as const;

export type ControlChunkId = keyof typeof CONTROL_MODULES;

/** Which chunk draws a type; types without one are drawn by the main renderer. */
export const CHUNK_BY_TYPE: Partial<Record<FieldType, ControlChunkId>> = {
  picture_choice: 'choices',
  yes_no: 'choices',
  nps: 'choices',
  opinion_scale: 'choices',
  consent: 'choices',
  slider: 'slider',
  ranking: 'ranking',
  matrix: 'matrix',
  address: 'address',
  phone: 'inputs',
  time: 'inputs',
  date_range: 'inputs',
  url: 'inputs',
  currency: 'inputs',
  color: 'inputs',
  signature: 'signature',
  voice_note: 'voice',
  file: 'file',
  image: 'blocks',
  video: 'blocks',
};

/** The chunk for ratings drawn as stars, hearts or faces; plain numbers need none. */
export const RATING_ICONS_CHUNK: ControlChunkId = 'choices';

/** The chunk a field's control is in, if it is not in the main renderer. */
export function controlChunk(field: {
  type: FieldType;
  ratingStyle?: string;
}): ControlChunkId | null {
  if (field.type === 'rating')
    return field.ratingStyle && field.ratingStyle !== 'numbers' ? RATING_ICONS_CHUNK : null;
  return CHUNK_BY_TYPE[field.type] ?? null;
}
