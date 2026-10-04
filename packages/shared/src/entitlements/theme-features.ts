import { getFont } from '../assets/fonts.js';
import { getShape } from '../assets/shapes.js';
import { getTexture } from '../assets/textures.js';
import type { FormTheme } from '../theme/schema.js';
import { FEATURE_IDS, type FeatureId } from './features.js';

/**
 * The plan features a theme uses, in registry order. Anyone may try them in the editor;
 * publishing checks them (see `missingFeatures`).
 */
export function requiredFeatures(theme: FormTheme): FeatureId[] {
  const needed = new Set<FeatureId>();
  const { headingFont, bodyFont } = theme.typography;

  if ([headingFont, bodyFont].some((font) => getFont(font).tier === 'pro')) {
    needed.add('premium_fonts');
  }
  for (const layer of theme.background.layers) {
    if (layer.type === 'mesh') needed.add('mesh_gradients');
    if (layer.type === 'texture' && getTexture(layer.assetId).tier === 'pro') {
      needed.add('premium_textures');
    }
    if (layer.type === 'shapes' && layer.items.some((item) => getShape(item.type).tier === 'pro')) {
      needed.add('custom_shapes');
    }
  }
  if (theme.layout.mode === 'conversational') needed.add('conversational_layout');
  if (!theme.branding.showFormyxBadge) needed.add('remove_branding');

  return FEATURE_IDS.filter((id) => needed.has(id));
}
