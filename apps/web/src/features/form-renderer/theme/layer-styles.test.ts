import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDefaultTheme, TEXTURES, type BackgroundLayer } from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import { cssUrl, isAnimatableLayer, layerStyle } from './layer-styles';

const theme = createDefaultTheme();
const common = { id: 'l', opacity: 1, blendMode: 'normal' } as const;

describe('layerStyle', () => {
  it('paints solid colours', () => {
    expect(layerStyle({ ...common, type: 'solid', color: '#F7F6F3' }, theme)).toEqual({
      opacity: 1,
      backgroundColor: '#F7F6F3',
    });
  });

  it('paints linear and radial gradients from their stops', () => {
    const stops = [
      { color: '#2F5D46', position: 0 },
      { color: '#1F3B2D', position: 100 },
    ];
    expect(layerStyle({ ...common, type: 'linear', angle: 160, stops }, theme)).toMatchObject({
      backgroundImage: 'linear-gradient(160deg, #2F5D46 0%, #1F3B2D 100%)',
    });
    expect(
      layerStyle(
        { ...common, type: 'radial', shape: 'ellipse', center: { x: 50, y: 0 }, stops },
        theme,
      ),
    ).toMatchObject({
      backgroundImage: 'radial-gradient(ellipse at 50% 0%, #2F5D46 0%, #1F3B2D 100%)',
    });
  });

  it('paints a mesh as one soft ellipse per point', () => {
    const style = layerStyle(
      {
        ...common,
        type: 'mesh',
        points: [
          { x: 8, y: 12, color: '#BFE0D6', spread: 55 },
          { x: 88, y: 6, color: '#C9DDEB', spread: 50 },
          { x: 92, y: 88, color: '#9CCBC4', spread: 60 },
          { x: 12, y: 92, color: '#EEF5E9', spread: 55 },
        ],
      },
      theme,
    );
    const gradients = String(style.backgroundImage).split('), radial-gradient(');
    expect(gradients).toHaveLength(4);
    expect(style.backgroundImage).toMatch(
      /^radial-gradient\(55% 55% at 8% 12%, #BFE0D6 0%, transparent 100%\)/,
    );
  });

  it('draws textures as a tinted mask, scaled, in the text colour unless tinted', () => {
    const grain = TEXTURES.find((texture) => texture.id === 'grain');
    const style = layerStyle(
      { ...common, opacity: 0.3, type: 'texture', assetId: 'grain', scale: 1.5 },
      theme,
    );
    expect(style).toMatchObject({
      opacity: 0.3,
      backgroundColor: theme.colors.text,
      maskImage: 'url("/textures/grain.svg")',
      maskSize: `${(grain?.tileSize ?? 0) * 1.5}px`,
      maskRepeat: 'repeat',
      WebkitMaskImage: 'url("/textures/grain.svg")',
    });
    expect(
      layerStyle({ ...common, type: 'texture', assetId: 'paper', scale: 1, tint: '#5C4A32' }, theme)
        .backgroundColor,
    ).toBe('#5C4A32');
  });

  it('crops images around their focal point', () => {
    expect(
      layerStyle(
        {
          ...common,
          type: 'image',
          url: 'https://res.cloudinary.com/demo/bg.jpg',
          focalPoint: { x: 30, y: 70 },
          fit: 'cover',
        },
        theme,
      ),
    ).toMatchObject({
      backgroundImage: 'url("https://res.cloudinary.com/demo/bg.jpg")',
      backgroundSize: 'cover',
      backgroundPosition: '30% 70%',
    });
  });

  it('applies opacity and blend mode to the whole layer', () => {
    expect(
      layerStyle(
        { ...common, opacity: 0.5, blendMode: 'multiply', type: 'solid', color: '#000000' },
        theme,
      ),
    ).toMatchObject({ opacity: 0.5, mixBlendMode: 'multiply' });
  });
});

describe('cssUrl', () => {
  it('cannot be broken out of', () => {
    expect(cssUrl('https://x.test/a").b{color:red}\\')).toBe(
      'url("https://x.test/a%22).b{color:red}%5C")',
    );
  });
});

describe('isAnimatableLayer', () => {
  it('drifts gradients and shapes, never solid colours, textures or photos', () => {
    const kinds: [BackgroundLayer['type'], boolean][] = [
      ['solid', false],
      ['linear', true],
      ['radial', true],
      ['mesh', true],
      ['texture', false],
      ['shapes', true],
      ['image', false],
    ];
    for (const [type, expected] of kinds) {
      expect(isAnimatableLayer({ type } as BackgroundLayer)).toBe(expected);
    }
  });
});

describe('texture files', () => {
  it.each(TEXTURES)('$name is an SVG tile in public/', (texture) => {
    const path = join(import.meta.dirname, '../../../../public', texture.file);
    expect(existsSync(path)).toBe(true);
    const svg = readFileSync(path, 'utf8');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain(`width="${texture.tileSize}" height="${texture.tileSize}"`);
  });
});
