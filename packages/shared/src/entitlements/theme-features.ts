import { getFont } from '../assets/fonts.js';
import { getShape } from '../assets/shapes.js';
import { getTexture } from '../assets/textures.js';
import type { FormTheme } from '../theme/schema.js';
import { FEATURE_IDS, type FeatureId } from './features.js';

/** A plan feature a theme uses, and which of its assets (font, texture or shape ids). */
export interface PremiumAssetUse {
  feature: FeatureId;
  /** Asset ids, each once; for features without assets, the setting that needs them. */
  assets: string[];
}

/**
 * The plan features a theme uses and the assets that need them, in registry order. Product
 * analytics reports these on publish, to learn which premium looks people choose.
 */
export function premiumAssetsUsed(theme: FormTheme): PremiumAssetUse[] {
  const used = new Map<FeatureId, Set<string>>();
  const add = (feature: FeatureId, asset: string) => {
    used.set(feature, (used.get(feature) ?? new Set()).add(asset));
  };

  for (const font of [theme.typography.headingFont, theme.typography.bodyFont]) {
    if (getFont(font).tier === 'pro') add('premium_fonts', font);
  }
  // Hidden layers are not drawn, so they need nothing to publish.
  for (const layer of theme.background.layers.filter((candidate) => !candidate.hidden)) {
    if (layer.type === 'mesh') add('mesh_gradients', 'mesh');
    if (layer.type === 'texture' && getTexture(layer.assetId).tier === 'pro') {
      add('premium_textures', layer.assetId);
    }
    if (layer.type === 'shapes') {
      for (const item of layer.items) {
        if (getShape(item.type).tier === 'pro') add('custom_shapes', item.type);
      }
    }
  }
  if (theme.layout.mode === 'conversational') add('conversational_layout', 'conversational');
  if (!theme.branding.showFormyxBadge) add('remove_branding', 'badge_hidden');

  return FEATURE_IDS.flatMap((feature) => {
    const assets = used.get(feature);
    return assets ? [{ feature, assets: [...assets] }] : [];
  });
}

/**
 * The plan features a theme uses, in registry order. Anyone may try them in the editor;
 * publishing checks them (see `missingFeatures`).
 */
export function requiredFeatures(theme: FormTheme): FeatureId[] {
  return premiumAssetsUsed(theme).map(({ feature }) => feature);
}
