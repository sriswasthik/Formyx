import { describe, expect, it } from 'vitest';
import { createDefaultTheme, migrateTheme } from './migrate.js';
import {
  hasTextIssues,
  primaryHasEnoughContrast,
  readabilityFixes,
  textSurfaces,
  themeReadabilityIssues,
  withCardFix,
  withOverlayFix,
  withTextColorFix,
} from './readability.js';
import type { BackgroundLayer } from './schema.js';
import type { FormTheme } from './schema.js';
import { ACCENT_PRESETS, SURFACES, withPrimaryColor, withSurface } from './surfaces.js';
import { THEME_V1_BACKGROUNDS } from './theme-v1.js';

const base = createDefaultTheme();
const parts = (theme: FormTheme) => themeReadabilityIssues(theme).map((issue) => issue.part);

describe('themeReadabilityIssues', () => {
  it('finds nothing wrong with the default theme', () => {
    expect(themeReadabilityIssues(base)).toEqual([]);
  });

  it.each(
    THEME_V1_BACKGROUNDS.flatMap((background) =>
      ACCENT_PRESETS.map(({ label, color }) => ({ background, label, color })),
    ),
  )('passes for every v1 accent preset on $background ($label)', ({ background, color }) => {
    const theme = migrateTheme({
      accentColor: color,
      font: 'inter',
      radius: 'rounded',
      background,
    });
    expect(themeReadabilityIssues(theme)).toEqual([]);
  });

  it('flags text that fades into the background', () => {
    const theme: FormTheme = { ...base, colors: { ...base.colors, text: '#EEEEEE' } };
    expect(parts(theme)).toEqual(['text', 'inputText']);
  });

  it('flags a primary colour that does not stand out', () => {
    const theme = withPrimaryColor(base, '#F0E68C');
    expect(primaryHasEnoughContrast(theme)).toBe(false);
    expect(
      primaryHasEnoughContrast(withPrimaryColor(withSurface(base, '#18181B'), '#1E2A3A')),
    ).toBe(false);
    expect(primaryHasEnoughContrast(base)).toBe(true);
  });

  it('checks button labels for the button style in use', () => {
    const pale = { ...base, colors: { ...base.colors, primary: '#8AB0EA', buttonText: '#FFFFFF' } };
    // White on light blue is too faint for a solid button...
    expect(parts(pale)).toContain('button');
    // ...and so is light blue text on white for an outline one.
    const outline: FormTheme = {
      ...pale,
      colors: { ...pale.colors, buttonText: '#18181B' },
      components: { ...pale.components, buttonStyle: 'outline' },
    };
    expect(parts(outline)).toContain('button');
  });

  it('reads text against every background colour, through the overlay', () => {
    const gradient: FormTheme = {
      ...base,
      background: {
        layers: [
          {
            id: 'g',
            type: 'linear',
            angle: 180,
            stops: [
              { color: '#FFFFFF', position: 0 },
              { color: '#18181B', position: 100 },
            ],
            opacity: 1,
            blendMode: 'normal',
          },
        ],
      },
    };
    expect(parts(gradient)).toContain('text');

    // A strong white overlay brings the dark end up far enough.
    const washed: FormTheme = { ...gradient, overlay: { color: '#FFFFFF', opacity: 0.9, blur: 8 } };
    const surfaces = textSurfaces(washed);
    expect(surfaces).toContain('#FDFDFD');
    expect(surfaces.every((surface) => surface >= '#E8E8E8')).toBe(true);
    expect(parts(washed)).not.toContain('text');
  });

  it('uses the container colour when the form sits in a card', () => {
    const dark = withSurface(base, SURFACES[2].color);
    const carded: FormTheme = {
      ...dark,
      colors: { ...base.colors },
      components: { ...dark.components, containerStyle: 'card' },
    };
    expect(textSurfaces(carded)).toEqual(['#FFFFFF']);
    expect(themeReadabilityIssues(carded)).toEqual([]);
  });
});

const layer = { opacity: 1, blendMode: 'normal' } as const;
const withLayers = (theme: FormTheme, ...layers: BackgroundLayer[]): FormTheme => ({
  ...theme,
  background: { layers },
});
const white: BackgroundLayer = { ...layer, id: 'base', type: 'solid', color: '#FFFFFF' };

describe('the effective background', () => {
  it('counts layer opacity: a faint dark layer over white keeps dark text readable', () => {
    const faint = withLayers(base, white, {
      ...layer,
      id: 'dark',
      type: 'solid',
      color: '#000000',
      opacity: 0.02,
    });
    expect(textSurfaces(faint)).toEqual(['#FAFAFA']);
    expect(themeReadabilityIssues(faint)).toEqual([]);

    const strong = withLayers(base, white, {
      ...layer,
      id: 'dark',
      type: 'solid',
      color: '#000000',
      opacity: 0.8,
    });
    expect(parts(strong)).toContain('text');
  });

  it('skips hidden layers', () => {
    const hidden = withLayers(base, white, {
      ...layer,
      id: 'dark',
      type: 'solid',
      color: '#000000',
      hidden: true,
    });
    expect(textSurfaces(hidden)).toEqual(['#FFFFFF']);
  });

  it('applies blend modes', () => {
    const multiplied = withLayers(
      base,
      { ...white, color: '#808080' },
      { ...layer, id: 'm', type: 'solid', color: '#808080', blendMode: 'multiply' },
    );
    expect(textSurfaces(multiplied)).toEqual(['#404040']);
  });

  it('follows a mesh: a dark point far from the text does not count, one under it does', () => {
    const mesh = (x: number, y: number): BackgroundLayer => ({
      ...layer,
      id: 'mesh',
      type: 'mesh',
      points: [
        { x, y, color: '#18181B', spread: 10 },
        { x: 0, y: 0, color: '#FFFFFF', spread: 10 },
        { x: 100, y: 0, color: '#FFFFFF', spread: 10 },
        { x: 0, y: 100, color: '#FFFFFF', spread: 10 },
      ],
    });
    expect(parts(withLayers(base, white, mesh(50, 50)))).toContain('text');
    // Off in a corner, beyond the text on any screen.
    expect(parts(withLayers(base, white, mesh(100, 100)))).toEqual([]);
  });

  it('counts textures by their tint and coverage', () => {
    const texture = (density: number, opacity: number): BackgroundLayer => ({
      ...layer,
      id: 'dots',
      type: 'texture',
      assetId: 'grain',
      scale: 1,
      density,
      opacity,
      tint: '#000000',
    });
    expect(parts(withLayers(base, white, texture(0.5, 0.1)))).toEqual([]);
    const surfaces = textSurfaces(withLayers(base, white, texture(1, 1)));
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]).not.toBe('#FFFFFF');
  });

  it('counts shapes only where they cover the text, and not on phones when hidden there', () => {
    const shapes = (x: number, hideOnMobile = false): BackgroundLayer => ({
      ...layer,
      id: 'shapes',
      type: 'shapes',
      hideOnMobile,
      items: [
        {
          id: 'big',
          type: 'circle',
          x,
          y: 50,
          size: 30,
          rotation: 0,
          color: '#18181B',
          opacity: 1,
          blur: 0,
        },
      ],
    });
    expect(parts(withLayers(base, white, shapes(50)))).toContain('text');
    // Beside the column on a desktop, but behind the text on a phone...
    expect(parts(withLayers(base, white, shapes(8)))).toContain('text');
    // ...unless hidden there.
    expect(parts(withLayers(base, white, shapes(8, true)))).toEqual([]);
  });

  it('treats an image as any colour, so it needs an overlay or a card', () => {
    const image: BackgroundLayer = {
      ...layer,
      id: 'photo',
      type: 'image',
      url: 'https://res.cloudinary.com/demo/photo.jpg',
      focalPoint: { x: 50, y: 50 },
      fit: 'cover',
    };
    const photo = withLayers(base, image);
    expect(parts(photo)).toContain('text');
    expect(textSurfaces(photo)).toEqual(expect.arrayContaining(['#000000', '#FFFFFF']));
    expect(hasTextIssues(themeReadabilityIssues(withCardFix(photo)))).toBe(false);
    expect(withOverlayFix(photo)?.overlay.opacity).toBeGreaterThan(0.5);
  });

  it('reports each part once, against the colour it fares worst on', () => {
    const gradient = withLayers(base, {
      ...layer,
      id: 'g',
      type: 'linear',
      angle: 180,
      stops: [
        { color: '#FFFFFF', position: 0 },
        { color: '#18181B', position: 100 },
      ],
    });
    const text = themeReadabilityIssues(gradient).filter((issue) => issue.part === 'text');
    expect(text).toHaveLength(1);
    expect(text[0]?.ratio).toBeLessThan(1.5);
  });
});

describe('readabilityFixes', () => {
  const darkMiddle = withLayers(base, {
    ...layer,
    id: 'g',
    type: 'radial',
    shape: 'circle',
    center: { x: 50, y: 50 },
    stops: [
      { color: '#3F3F46', position: 0 },
      { color: '#FFFFFF', position: 100 },
    ],
  });

  it('offers nothing when the text reads well', () => {
    expect(readabilityFixes(base)).toEqual([]);
  });

  it('offers fixes that each clear every text issue', () => {
    const fixes = readabilityFixes(darkMiddle);
    expect(fixes.map((fix) => fix.id)).toEqual(['overlay', 'card']);
    for (const fix of fixes) {
      expect(hasTextIssues(themeReadabilityIssues(fix.theme))).toBe(false);
    }
  });

  it('adds the lightest overlay that works, in the container colour', () => {
    const fixed = withOverlayFix(darkMiddle);
    expect(fixed?.overlay.color).toBe('#FFFFFF');
    const lighter = fixed && {
      ...fixed,
      overlay: { ...fixed.overlay, opacity: fixed.overlay.opacity - 0.05 },
    };
    expect(lighter && hasTextIssues(themeReadabilityIssues(lighter))).toBe(true);
  });

  it('turns the text light on a dark background', () => {
    const dark = withLayers(base, { ...white, color: '#1D2A3A' });
    expect(hasTextIssues(themeReadabilityIssues(dark))).toBe(true);
    const fixed = withTextColorFix(dark);
    expect(fixed.colors.text).toBe('#FAFAFA');
    expect(hasTextIssues(themeReadabilityIssues(fixed))).toBe(false);
    expect(readabilityFixes(dark).map((fix) => fix.id)).toContain('text_color');
  });
});
