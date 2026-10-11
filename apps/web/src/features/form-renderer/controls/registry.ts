import type { FieldType, FormSchema } from '@formyx/shared';
import { useEffect, useState, type ComponentType } from 'react';
import type { ControlProps } from '../types';

/*
 * The controls for Sprint 12's question types live in chunks of their own, so a form only
 * downloads the ones it uses. The public form preloads them while its skeleton shows (like
 * its fonts), so they draw at once; elsewhere a placeholder holds their place for a moment.
 */

/** What every control chunk exports: the control for any of its types. */
export interface ControlChunk {
  Control: ComponentType<ControlProps>;
}

const LOADERS = {
  choices: () => import('./choice-extra'),
  slider: () => import('./slider-control'),
  ranking: () => import('./ranking-control'),
  matrix: () => import('./matrix-control'),
  address: () => import('./address-control'),
  inputs: () => import('./input-extra'),
  signature: () => import('./signature-control'),
  voice: () => import('./voice-control'),
  file: () => import('./file-chunk'),
  blocks: () => import('./content-blocks'),
} satisfies Record<string, () => Promise<ControlChunk>>;

export type ControlChunkId = keyof typeof LOADERS;

/** Which chunk draws a type; types without one are drawn by the main renderer. */
const CHUNK_BY_TYPE: Partial<Record<FieldType, ControlChunkId>> = {
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

/** The chunk a field's control is in, if it is not in the main renderer. */
export function controlChunk(field: {
  type: FieldType;
  ratingStyle?: string;
}): ControlChunkId | null {
  // Plain number ratings are drawn by the main renderer; stars, hearts and faces load.
  if (field.type === 'rating')
    return field.ratingStyle && field.ratingStyle !== 'numbers' ? 'choices' : null;
  return CHUNK_BY_TYPE[field.type] ?? null;
}

const loaded = new Map<ControlChunkId, ControlChunk>();
const loading = new Map<ControlChunkId, Promise<ControlChunk>>();

export function loadControlChunk(id: ControlChunkId): Promise<ControlChunk> {
  let pending = loading.get(id);
  if (!pending) {
    pending = LOADERS[id]().then((chunk) => {
      loaded.set(id, chunk);
      return chunk;
    });
    pending.catch(() => {
      // Try again next time.
      loading.delete(id);
    });
    loading.set(id, pending);
  }
  return pending;
}

/** Loads the controls a form's questions need. Never rejects. */
export async function preloadFieldControls(schema: Pick<FormSchema, 'fields'>): Promise<void> {
  const ids = new Set(schema.fields.flatMap((field) => controlChunk(field) ?? []));
  await Promise.all([...ids].map((id) => loadControlChunk(id).catch(() => undefined)));
}

/** A control chunk once it has loaded; starts loading it. */
export function useControlChunk(id: ControlChunkId): ControlChunk | null {
  const [chunk, setChunk] = useState(() => loaded.get(id) ?? null);
  useEffect(() => {
    if (chunk) return;
    let current = true;
    void loadControlChunk(id).then((next) => {
      if (current) setChunk(next);
    });
    return () => {
      current = false;
    };
  }, [id, chunk]);
  return chunk ?? loaded.get(id) ?? null;
}
