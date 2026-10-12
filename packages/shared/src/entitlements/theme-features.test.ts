import { describe, expect, it } from 'vitest';
import { createDefaultTheme } from '../theme/migrate.js';
import type { BackgroundLayer, FormTheme } from '../theme/schema.js';
import { premiumAssetsUsed, requiredFeatures } from './theme-features.js';

const base = createDefaultTheme();
const common = { opacity: 1, blendMode: 'normal' } as const;

function withLayer(layer: BackgroundLayer): FormTheme {
  return { ...base, background: { layers: [...base.background.layers, layer] } };
}

const shapes = (type: 'circle' | 'blob'): BackgroundLayer => ({
  id: 'shapes',
  type: 'shapes',
  items: [
    {
      id: 'a',
      type: 'circle',
      x: 10,
      y: 10,
      size: 10,
      rotation: 0,
      color: '#000000',
      opacity: 1,
      blur: 0,
    },
    { id: 'b', type, x: 50, y: 50, size: 10, rotation: 0, color: '#000000', opacity: 1, blur: 0 },
  ],
  ...common,
});

describe('requiredFeatures', () => {
  it('needs nothing for the default theme', () => {
    expect(requiredFeatures(base)).toEqual([]);
  });

  it.each([
    [
      'a Pro heading font',
      { ...base, typography: { ...base.typography, headingFont: 'fraunces' } },
      ['premium_fonts'],
    ],
    [
      'a Pro body font',
      { ...base, typography: { ...base.typography, bodyFont: 'space-grotesk' } },
      ['premium_fonts'],
    ],
    ['a free font', { ...base, typography: { ...base.typography, headingFont: 'dm-sans' } }, []],
    [
      'a mesh gradient',
      withLayer({
        id: 'mesh',
        type: 'mesh',
        points: Array.from({ length: 4 }, (_, i) => ({
          x: i * 30,
          y: 0,
          color: '#FFFFFF',
          spread: 40,
        })),
        ...common,
      }),
      ['mesh_gradients'],
    ],
    [
      'a Pro texture',
      withLayer({ id: 't', type: 'texture', assetId: 'paper', scale: 1, ...common }),
      ['premium_textures'],
    ],
    [
      'a free texture',
      withLayer({ id: 't', type: 'texture', assetId: 'grain', scale: 1, ...common }),
      [],
    ],
    ['a Pro shape among free ones', withLayer(shapes('blob')), ['custom_shapes']],
    ['free shapes only', withLayer(shapes('circle')), []],
    [
      'the conversational layout',
      { ...base, layout: { ...base.layout, mode: 'conversational' } },
      ['conversational_layout'],
    ],
    [
      'a hidden Formyx badge',
      { ...base, branding: { showFormyxBadge: false } },
      ['remove_branding'],
    ],
    [
      'a gradient, a split layout and an image',
      withLayer({
        id: 'img',
        type: 'image',
        url: 'https://res.cloudinary.com/demo/bg.jpg',
        focalPoint: { x: 50, y: 50 },
        fit: 'cover',
        ...common,
      }),
      [],
    ],
  ] satisfies [string, FormTheme, string[]][])('%s', (_case, theme, expected) => {
    expect(requiredFeatures(theme)).toEqual(expected);
  });

  it('ignores hidden layers, which are not drawn', () => {
    const mesh = withLayer({
      id: 'mesh',
      type: 'mesh',
      hidden: true,
      points: Array.from({ length: 4 }, (_, i) => ({
        x: i * 30,
        y: 0,
        color: '#FFFFFF',
        spread: 40,
      })),
      ...common,
    });
    expect(requiredFeatures(mesh)).toEqual([]);
  });

  it('lists each feature once, in registry order', () => {
    const theme: FormTheme = {
      ...withLayer(shapes('blob')),
      typography: { ...base.typography, headingFont: 'fraunces', bodyFont: 'fraunces' },
      branding: { showFormyxBadge: false },
    };
    expect(requiredFeatures(theme)).toEqual(['premium_fonts', 'custom_shapes', 'remove_branding']);
  });
});

describe('premiumAssetsUsed', () => {
  it('names the assets behind each feature, each once', () => {
    const theme: FormTheme = {
      ...withLayer(shapes('blob')),
      background: {
        layers: [
          ...withLayer(shapes('blob')).background.layers,
          { id: 't', type: 'texture', assetId: 'paper', scale: 1, ...common },
          { id: 'g', type: 'texture', assetId: 'grain', scale: 1, ...common },
        ],
      },
      typography: { ...base.typography, headingFont: 'fraunces', bodyFont: 'fraunces' },
      layout: { ...base.layout, mode: 'conversational' },
    };
    expect(premiumAssetsUsed(theme)).toEqual([
      { feature: 'premium_fonts', assets: ['fraunces'] },
      { feature: 'premium_textures', assets: ['paper'] },
      { feature: 'custom_shapes', assets: ['blob'] },
      { feature: 'conversational_layout', assets: ['conversational'] },
    ]);
  });

  it('is empty for the default theme', () => {
    expect(premiumAssetsUsed(base)).toEqual([]);
  });
});
