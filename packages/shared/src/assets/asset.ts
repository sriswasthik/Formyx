import { z } from 'zod';

/*
 * Fonts, textures, shapes, palettes and theme presets that creators style forms with. Saved
 * themes refer to assets by id, so once an asset ships its id never changes and it is never
 * removed: retire it from pickers instead.
 */

/** Who may publish with an asset. Anyone can try Pro assets in the editor. */
export const ASSET_TIERS = ['free', 'pro'] as const;
export const assetTierSchema = z.enum(ASSET_TIERS);
export type AssetTier = z.infer<typeof assetTierSchema>;

/** What every asset has. Each kind adds what it takes to draw it, which pickers preview. */
export interface Asset<Id extends string = string, Category extends string = string> {
  id: Id;
  name: string;
  category: Category;
  tier: AssetTier;
  /** An SPDX identifier, e.g. `OFL-1.1`. */
  license: string;
  /** Where it comes from: a URL, or who made it. */
  source: string;
}

/** Assets made for Formyx and given to the public domain. */
export const FORMYX_LICENSE = 'CC0-1.0';
export const FORMYX_SOURCE = 'Made for Formyx';

/** The ids of `assets` as a tuple, for `z.enum`. */
export function assetIds<const T extends readonly { id: string }[]>(
  assets: T,
): [T[number]['id'], ...T[number]['id'][]] {
  return assets.map((asset) => asset.id) as [T[number]['id'], ...T[number]['id'][]];
}

/** Looks an asset up by id. */
export function assetById<T extends { id: string }>(
  assets: readonly T[],
  id: string,
): T | undefined {
  return assets.find((asset) => asset.id === id);
}
