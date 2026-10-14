import type { FontId } from '../assets/fonts.js';
import type { ShapeId } from '../assets/shapes.js';
import type { TextureId } from '../assets/textures.js';
import type { BackgroundLayer, FormTheme, GradientStop } from '../theme/schema.js';
import type { FeatureId } from './features.js';

/*
 * How a form looks on a plan without the Pro features its theme uses: each Pro font, texture
 * and shape becomes the closest free one, a mesh gradient a linear gradient of its colours,
 * the one-question-at-a-time layout the classic one, and the Formyx badge shows again. Applied
 * when a form is drawn for respondents, never saved: the creator's theme is kept as it is, so
 * upgrading again brings the look back. Each swap keeps the colours, so the theme stays readable.
 */

/** The free font closest to each Pro one: same feel, same category where there is a free one. */
export const PRO_FONT_FALLBACKS: Partial<Record<FontId, FontId>> = {
  'eb-garamond': 'crimson-pro',
  newsreader: 'source-serif-4',
  fraunces: 'lora',
  'playfair-display': 'libre-baskerville',
  'space-grotesk': 'dm-sans',
  'bricolage-grotesque': 'plus-jakarta-sans',
  syne: 'sora',
  unbounded: 'outfit',
  'bodoni-moda': 'libre-baskerville',
  'dm-serif-display': 'lora',
  caveat: 'kalam',
  'dancing-script': 'kalam',
};

/** The free texture closest to each Pro one. */
export const PRO_TEXTURE_FALLBACKS: Partial<Record<TextureId, TextureId>> = {
  paper: 'grain',
  linen: 'grain',
  'paper-fibre': 'grain',
  concrete: 'grain',
  'cross-hatch': 'diagonal',
  waves: 'diagonal',
  topographic: 'grain',
};

/** The free shape closest to each Pro one. */
export const PRO_SHAPE_FALLBACKS: Partial<Record<ShapeId, ShapeId>> = {
  blob: 'circle',
  sparkle: 'cross',
  squiggle: 'pill',
  arc: 'half-circle',
  star: 'cross',
  arch: 'half-circle',
  wave: 'pill',
};

/** One thing drawn differently: what the theme asks for and what is drawn instead. */
export interface ThemeFallback {
  feature: FeatureId;
  /** The asset id or setting the theme uses. */
  from: string;
  /** What is drawn instead. */
  to: string;
}

/** A mesh gradient as a linear one, its colours in order along the diagonal. */
function meshAsLinear(layer: Extract<BackgroundLayer, { type: 'mesh' }>): BackgroundLayer {
  const stops: GradientStop[] = [...layer.points]
    .sort((a, b) => a.x + a.y - (b.x + b.y))
    .slice(0, 6)
    .map((point) => ({ color: point.color, position: Math.round((point.x + point.y) / 2) }));
  const { id, opacity, blendMode, hidden } = layer;
  return {
    id,
    opacity,
    blendMode,
    ...(hidden === undefined ? {} : { hidden }),
    type: 'linear',
    angle: 135,
    stops,
  };
}

/**
 * The theme as a plan with `features` draws it, and what was swapped. A theme that uses no
 * missing feature comes back as it is, with no fallbacks.
 */
export function themeForFeatures(
  theme: FormTheme,
  features: Readonly<Record<FeatureId, boolean>>,
): { theme: FormTheme; fallbacks: ThemeFallback[] } {
  const fallbacks: ThemeFallback[] = [];
  const note = (feature: FeatureId, from: string, to: string) => {
    if (!fallbacks.some((fallback) => fallback.feature === feature && fallback.from === from)) {
      fallbacks.push({ feature, from, to });
    }
  };

  const font = (id: FontId): FontId => {
    const fallback = PRO_FONT_FALLBACKS[id];
    if (features.premium_fonts || !fallback) return id;
    note('premium_fonts', id, fallback);
    return fallback;
  };

  const layer = (current: BackgroundLayer): BackgroundLayer => {
    // Hidden layers are not drawn, so they need nothing.
    if (current.hidden) return current;
    if (current.type === 'mesh' && !features.mesh_gradients) {
      note('mesh_gradients', 'mesh', 'linear');
      return meshAsLinear(current);
    }
    if (current.type === 'texture' && !features.premium_textures) {
      const fallback = PRO_TEXTURE_FALLBACKS[current.assetId];
      if (fallback) {
        note('premium_textures', current.assetId, fallback);
        return { ...current, assetId: fallback };
      }
    }
    if (current.type === 'shapes' && !features.custom_shapes) {
      return {
        ...current,
        items: current.items.map((item) => {
          const fallback = PRO_SHAPE_FALLBACKS[item.type];
          if (!fallback) return item;
          note('custom_shapes', item.type, fallback);
          // Free shapes have one drawing: a seed would mean nothing to them.
          const { seed: _seed, ...rest } = item;
          return { ...rest, type: fallback };
        }),
      };
    }
    return current;
  };

  const conversational = theme.layout.mode === 'conversational' && !features.conversational_layout;
  if (conversational) note('conversational_layout', 'conversational', 'classic');
  const badgeHidden = !theme.branding.showFormyxBadge && !features.remove_branding;
  if (badgeHidden) note('remove_branding', 'badge_hidden', 'badge_shown');

  const next: FormTheme = {
    ...theme,
    typography: {
      ...theme.typography,
      headingFont: font(theme.typography.headingFont),
      bodyFont: font(theme.typography.bodyFont),
    },
    background: { ...theme.background, layers: theme.background.layers.map(layer) },
    layout: conversational ? { ...theme.layout, mode: 'classic' } : theme.layout,
    branding: badgeHidden ? { ...theme.branding, showFormyxBadge: true } : theme.branding,
  };
  return fallbacks.length === 0 ? { theme, fallbacks } : { theme: next, fallbacks };
}
