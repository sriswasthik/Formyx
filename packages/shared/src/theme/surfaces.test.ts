import { describe, expect, it } from 'vitest';
import { createDefaultTheme } from './migrate.js';
import { formThemeSchema } from './schema.js';
import { matchingSurface, withPrimaryColor, withSurface } from './surfaces.js';
import { isSameTheme, themeImageUrls } from './theme-utils.js';

const base = createDefaultTheme();

describe('withSurface', () => {
  it('puts the form on one plain colour, with colours to match', () => {
    const busy = {
      ...base,
      background: {
        layers: [
          ...base.background.layers,
          {
            id: 'tex',
            type: 'texture',
            assetId: 'grain',
            scale: 1,
            opacity: 0.3,
            blendMode: 'normal',
          },
        ],
      },
      overlay: { color: '#000000', opacity: 0.4, blur: 6 },
    } satisfies typeof base;
    const dark = withSurface(busy, '#18181B');

    expect(formThemeSchema.safeParse(dark).success).toBe(true);
    expect(dark.background.layers).toHaveLength(1);
    expect(dark.overlay.opacity).toBe(0);
    expect(dark.colors).toMatchObject({ text: '#FAFAFA', containerBackground: '#18181B' });
    expect(dark.colors.primary).toBe(base.colors.primary);
    expect(matchingSurface(dark)).toBe('dark');
    expect(matchingSurface(busy)).toBeNull();
  });
});

describe('withPrimaryColor', () => {
  it('sets the primary colour and button text that reads on it', () => {
    expect(withPrimaryColor(base, '#f0e68c').colors).toMatchObject({
      primary: '#F0E68C',
      buttonText: '#18181B',
    });
    expect(withPrimaryColor(base, '#337B7E').colors.buttonText).toBe('#FFFFFF');
  });
});

describe('isSameTheme', () => {
  it('ignores key order but not values', () => {
    const reordered = JSON.parse(
      JSON.stringify(base, Object.keys(base).toReversed()),
    ) as typeof base;
    expect(isSameTheme(base, { ...reordered, ...base })).toBe(true);
    expect(isSameTheme(base, withPrimaryColor(base, '#337B7E'))).toBe(false);
  });
});

describe('themeImageUrls', () => {
  it('lists the logo, cover and image layers once each', () => {
    const logo = 'https://res.cloudinary.com/demo/logo.png';
    const cover = 'https://res.cloudinary.com/demo/cover.jpg';
    const theme = {
      ...base,
      background: {
        layers: [
          ...base.background.layers,
          {
            id: 'img',
            type: 'image',
            url: cover,
            focalPoint: { x: 50, y: 50 },
            fit: 'cover',
            opacity: 1,
            blendMode: 'normal',
          },
        ],
      },
      layout: { ...base.layout, coverImage: { url: cover, focalPoint: { x: 50, y: 50 } } },
      branding: { ...base.branding, logoUrl: logo },
    } satisfies typeof base;
    expect(themeImageUrls(theme)).toEqual([logo, cover]);
    expect(themeImageUrls(base)).toEqual([]);
  });
});
