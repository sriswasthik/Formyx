import { describe, expect, it } from 'vitest';
import { FONTS, getFont } from '../assets/fonts.js';
import { THEME_PRESETS } from '../assets/presets.js';
import { getShape, SHAPES } from '../assets/shapes.js';
import { getTexture, TEXTURES } from '../assets/textures.js';
import { readabilityFixes, themeReadabilityIssues } from '../theme/readability.js';
import { formThemeSchema, type FormTheme } from '../theme/schema.js';
import { resolveEntitlements } from './entitlements.js';
import {
  PRO_FONT_FALLBACKS,
  PRO_SHAPE_FALLBACKS,
  PRO_TEXTURE_FALLBACKS,
  themeForFeatures,
} from './theme-fallback.js';
import { requiredFeatures } from './theme-features.js';

const billing = (plan: 'FREE' | 'PRO') => ({
  plan,
  planStatus: 'ACTIVE' as const,
  trialEndsAt: null,
});
const free = resolveEntitlements(billing('FREE'), 'enforced').features;
const pro = resolveEntitlements(billing('PRO'), 'enforced').features;

describe('the fallbacks', () => {
  it('give every Pro font a free one', () => {
    for (const font of FONTS.filter((candidate) => candidate.tier === 'pro')) {
      const fallback = PRO_FONT_FALLBACKS[font.id];
      expect(fallback, font.id).toBeDefined();
      if (fallback) expect(getFont(fallback).tier, font.id).toBe('free');
    }
    for (const id of Object.keys(PRO_FONT_FALLBACKS)) {
      expect(getFont(id as keyof typeof PRO_FONT_FALLBACKS).tier).toBe('pro');
    }
  });

  it('give every Pro texture and shape a free one', () => {
    for (const texture of TEXTURES.filter((candidate) => candidate.tier === 'pro')) {
      const fallback = PRO_TEXTURE_FALLBACKS[texture.id];
      expect(fallback && getTexture(fallback).tier, texture.id).toBe('free');
    }
    for (const shape of SHAPES.filter((candidate) => candidate.tier === 'pro')) {
      const fallback = PRO_SHAPE_FALLBACKS[shape.id];
      expect(fallback && getShape(fallback).tier, shape.id).toBe('free');
    }
  });
});

describe.each(THEME_PRESETS)('the $name preset on Free', (preset) => {
  const { theme, fallbacks } = themeForFeatures(preset.theme, free);

  it('uses no Pro feature, and stays a valid theme', () => {
    expect(requiredFeatures(theme)).toEqual([]);
    expect(formThemeSchema.parse(theme)).toEqual(theme);
  });

  it('stays readable: text 4.5:1, primary colour 3:1', () => {
    expect(themeReadabilityIssues(theme)).toEqual([]);
    expect(readabilityFixes(theme)).toEqual([]);
  });

  it('says what it swapped, for each Pro feature the preset uses', () => {
    expect([...new Set(fallbacks.map((fallback) => fallback.feature))]).toEqual(
      requiredFeatures(preset.theme),
    );
  });
});

describe('themeForFeatures', () => {
  const proPreset = THEME_PRESETS.find((preset) => requiredFeatures(preset.theme).length > 0);
  if (!proPreset) throw new Error('No Pro preset');

  it('leaves a theme alone when the plan has what it uses', () => {
    const result = themeForFeatures(proPreset.theme, pro);
    expect(result.theme).toBe(proPreset.theme);
    expect(result.fallbacks).toEqual([]);
  });

  it('turns a mesh into a gradient of its colours, in order along the diagonal', () => {
    const theme: FormTheme = {
      ...proPreset.theme,
      background: {
        ...proPreset.theme.background,
        layers: [
          {
            id: 'mesh',
            type: 'mesh',
            opacity: 0.9,
            blendMode: 'normal',
            points: [
              { x: 100, y: 100, color: '#000000', spread: 50 },
              { x: 0, y: 0, color: '#FF0000', spread: 50 },
              { x: 100, y: 0, color: '#00FF00', spread: 50 },
              { x: 0, y: 60, color: '#0000FF', spread: 50 },
            ],
          },
        ],
      },
    };
    expect(themeForFeatures(theme, free).theme.background.layers).toEqual([
      {
        id: 'mesh',
        type: 'linear',
        opacity: 0.9,
        blendMode: 'normal',
        angle: 135,
        stops: [
          { color: '#FF0000', position: 0 },
          { color: '#0000FF', position: 30 },
          { color: '#00FF00', position: 50 },
          { color: '#000000', position: 100 },
        ],
      },
    ]);
  });

  it('leaves hidden layers as they are', () => {
    const theme: FormTheme = {
      ...proPreset.theme,
      background: {
        ...proPreset.theme.background,
        layers: [
          {
            id: 'paper',
            type: 'texture',
            assetId: 'paper',
            scale: 1,
            opacity: 0.5,
            blendMode: 'multiply',
            hidden: true,
          },
        ],
      },
    };
    expect(themeForFeatures(theme, free).theme.background.layers[0]).toMatchObject({
      assetId: 'paper',
    });
  });
});
