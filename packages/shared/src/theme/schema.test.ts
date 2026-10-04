import { describe, expect, it } from 'vitest';
import { createDefaultTheme } from './migrate.js';
import { formThemeSchema, MAX_LAYERS, type BackgroundLayer, type FormTheme } from './schema.js';

const base = createDefaultTheme();

function withLayers(...layers: BackgroundLayer[]): FormTheme {
  return { ...base, background: { layers } };
}

/** The paths of the issues a theme has, as `a.b.0.c`. */
function issuePaths(theme: unknown): string[] {
  const result = formThemeSchema.safeParse(theme);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

const common = { opacity: 1, blendMode: 'normal' } as const;

const everyLayer: BackgroundLayer[] = [
  { id: 'solid', type: 'solid', color: '#FFFFFF', ...common },
  {
    id: 'linear',
    type: 'linear',
    angle: 135,
    stops: [
      { color: '#F6EFE4', position: 0 },
      { color: '#DDBF9A', position: 100 },
    ],
    ...common,
  },
  {
    id: 'radial',
    type: 'radial',
    shape: 'circle',
    center: { x: 50, y: 0 },
    stops: [
      { color: '#22304A', position: 0 },
      { color: '#11151C', position: 70 },
    ],
    ...common,
  },
  {
    id: 'mesh',
    type: 'mesh',
    points: [
      { x: 0, y: 0, color: '#BFE0D6', spread: 50 },
      { x: 100, y: 0, color: '#C9DDEB', spread: 50 },
      { x: 100, y: 100, color: '#9CCBC4', spread: 50 },
      { x: 0, y: 100, color: '#EEF5E9', spread: 50 },
    ],
    ...common,
  },
  { id: 'texture', type: 'texture', assetId: 'grain', scale: 1, tint: '#18181B', ...common },
  {
    id: 'shapes',
    type: 'shapes',
    items: [
      {
        id: 's1',
        type: 'blob',
        x: 10,
        y: 10,
        size: 30,
        rotation: -12,
        color: '#E5C9A8',
        opacity: 0.8,
        blur: 4,
      },
    ],
    ...common,
  },
  {
    id: 'image',
    type: 'image',
    url: 'https://res.cloudinary.com/demo/image/upload/bg.jpg',
    focalPoint: { x: 50, y: 30 },
    fit: 'cover',
    opacity: 0.6,
    blendMode: 'multiply',
  },
];

describe('formThemeSchema (v2)', () => {
  it('accepts the default theme as is', () => {
    expect(formThemeSchema.parse(base)).toEqual(base);
  });

  it('accepts every kind of layer, with opacity and blend mode', () => {
    expect(issuePaths(withLayers(...everyLayer.slice(0, MAX_LAYERS)))).toEqual([]);
  });

  it('stores colours in capitals, so equal colours compare equal', () => {
    const theme = formThemeSchema.parse({
      ...base,
      colors: { ...base.colors, primary: '#4370bd' },
    });
    expect(theme.colors.primary).toBe('#4370BD');
  });

  it('accepts logo, cover and image layers only over https', () => {
    expect(
      issuePaths({ ...base, branding: { ...base.branding, logoUrl: 'http://x.com/logo.png' } }),
    ).toEqual(['branding.logoUrl']);
    expect(
      issuePaths({
        ...base,
        layout: {
          ...base.layout,
          coverImage: { url: 'javascript:alert(1)', focalPoint: { x: 50, y: 50 } },
        },
      }),
    ).toEqual(['layout.coverImage.url']);
  });

  it.each([
    ['a version other than 2', { ...base, version: 1 }, 'version'],
    ['no layers', withLayers(), 'background.layers'],
    [
      'too many layers',
      withLayers(
        ...Array.from({ length: MAX_LAYERS + 1 }, (_, i) => ({
          id: `l${i}`,
          type: 'solid' as const,
          color: '#FFFFFF',
          ...common,
        })),
      ),
      'background.layers',
    ],
    [
      'opacity above 1',
      withLayers({ id: 'a', type: 'solid', color: '#FFFFFF', opacity: 1.2, blendMode: 'normal' }),
      'background.layers.0.opacity',
    ],
    [
      'a blend mode CSS does not have',
      { ...base, background: { layers: [{ ...everyLayer[0], blendMode: 'add' }] } },
      'background.layers.0.blendMode',
    ],
    [
      'a gradient with one colour',
      withLayers({
        id: 'g',
        type: 'linear',
        angle: 0,
        stops: [{ color: '#FFFFFF', position: 0 }],
        ...common,
      }),
      'background.layers.0.stops',
    ],
    [
      'a mesh with three points',
      withLayers({
        id: 'm',
        type: 'mesh',
        points: Array.from({ length: 3 }, () => ({ x: 0, y: 0, color: '#FFFFFF', spread: 50 })),
        ...common,
      }),
      'background.layers.0.points',
    ],
    [
      'a mesh with nine points',
      withLayers({
        id: 'm',
        type: 'mesh',
        points: Array.from({ length: 9 }, () => ({ x: 0, y: 0, color: '#FFFFFF', spread: 50 })),
        ...common,
      }),
      'background.layers.0.points',
    ],
    [
      'a texture Formyx does not have',
      { ...base, background: { layers: [{ ...everyLayer[4], assetId: 'marble' }] } },
      'background.layers.0.assetId',
    ],
    [
      'a shape Formyx does not have',
      {
        ...base,
        background: {
          layers: [{ id: 'sh', type: 'shapes', items: [{ id: 'x', type: 'hexagon' }], ...common }],
        },
      },
      'background.layers.0.items.0.type',
    ],
    [
      'a font Formyx does not have',
      { ...base, typography: { ...base.typography, headingFont: 'comic-sans' } },
      'typography.headingFont',
    ],
    [
      'body text above 20px',
      { ...base, typography: { ...base.typography, baseSize: 22 } },
      'typography.baseSize',
    ],
    [
      'a heading weight between steps',
      { ...base, typography: { ...base.typography, headingWeight: 650 } },
      'typography.headingWeight',
    ],
    [
      'an input style it does not offer',
      { ...base, components: { ...base.components, inputStyle: 'shadowed' } },
      'components.inputStyle',
    ],
    [
      'a radius above 24px',
      { ...base, components: { ...base.components, radius: 40 } },
      'components.radius',
    ],
    [
      'a layout it does not offer',
      { ...base, layout: { ...base.layout, mode: 'grid' } },
      'layout.mode',
    ],
    ['a short hex colour', { ...base, colors: { ...base.colors, text: '#000' } }, 'colors.text'],
  ])('refuses %s', (_case, theme, path) => {
    expect(issuePaths(theme)).toContain(path);
  });

  it('needs unique layer and shape ids', () => {
    const [solid, , , , , shapes] = everyLayer;
    if (!solid || shapes?.type !== 'shapes') throw new Error('Fixture changed');
    const item = shapes.items[0];
    if (!item) throw new Error('Fixture changed');
    expect(issuePaths(withLayers(solid, { ...solid }))).toEqual(['background.layers.1.id']);
    expect(issuePaths(withLayers({ ...shapes, items: [item, { ...item }] }))).toEqual([
      'background.layers.0.items.1.id',
    ]);
  });
});
