import { describe, expect, it } from 'vitest';
import { requiredFeatures } from '../entitlements/theme-features.js';
import { contrastRatio, hexToRgb } from '../color.js';
import { extractPalette, hexToHsl, suggestThemeFromPalette } from './logo-palette.js';
import { createDefaultTheme } from './migrate.js';
import { themeReadabilityIssues } from './readability.js';
import { formThemeSchema, INPUT_STYLES, type FormTheme } from './schema.js';

/** RGBA pixels: `count` of each colour, at `alpha`. */
function pixels(...parts: { hex: string; count: number; alpha?: number }[]): number[] {
  return parts.flatMap(({ hex, count, alpha = 255 }) =>
    Array.from({ length: count }, () => [...hexToRgb(hex), alpha]).flat(),
  );
}

const base = createDefaultTheme();

describe('extractPalette', () => {
  it('finds a logo’s colours, most used first, leaving out its white and transparent parts', () => {
    const logo = pixels(
      { hex: '#FFFFFF', count: 500 },
      { hex: '#000000', count: 300, alpha: 0 },
      { hex: '#E4572E', count: 120 },
      { hex: '#17BEBB', count: 60 },
      { hex: '#1D1D1F', count: 30 },
    );
    const palette = extractPalette(logo);
    expect(palette.map((entry) => entry.color)).toEqual(['#E4572E', '#17BEBB', '#1D1D1F']);
    expect(palette.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(1);
    expect(palette[0]?.weight).toBeCloseTo(120 / 210);
  });

  it('is the same every time for the same pixels', () => {
    const noisy = Array.from({ length: 400 }, (_, index) => [
      (index * 37) % 256,
      (index * 91) % 256,
      (index * 53) % 256,
      255,
    ]).flat();
    expect(extractPalette(noisy)).toEqual(extractPalette(noisy));
    expect(extractPalette(noisy).length).toBeLessThanOrEqual(6);
    expect(extractPalette(noisy, 3).length).toBeLessThanOrEqual(3);
  });

  it('keeps a white logo white, and finds nothing in an empty image', () => {
    expect(extractPalette(pixels({ hex: '#FFFFFF', count: 10 }))).toEqual([
      { color: '#FFFFFF', weight: 1 },
    ]);
    expect(extractPalette(pixels({ hex: '#123456', count: 10, alpha: 0 }))).toEqual([]);
  });
});

describe('hexToHsl', () => {
  it('converts colours', () => {
    expect(hexToHsl('#FF0000')).toEqual({ h: 0, s: 1, l: 0.5 });
    expect(hexToHsl('#808080').s).toBe(0);
    expect(hexToHsl('#0000FF').h).toBe(240);
  });
});

describe('suggestThemeFromPalette', () => {
  const orange = [
    { color: '#E4572E', weight: 0.6 },
    { color: '#17BEBB', weight: 0.3 },
    { color: '#1D1D1F', weight: 0.1 },
  ];
  const logoUrl = 'https://res.cloudinary.com/demo/logo.png';

  it('builds a readable look around the brand colour, with the logo', () => {
    const theme = suggestThemeFromPalette(base, orange, logoUrl);
    expect(formThemeSchema.parse(theme)).toEqual(theme);
    expect(themeReadabilityIssues(theme)).toEqual([]);
    // The orange, dark enough to read as text on the page.
    expect(hexToHsl(theme.colors.primary).h).toBeCloseTo(hexToHsl('#E4572E').h, -1);
    expect(contrastRatio(theme.colors.primary, theme.colors.containerBackground)).toBeGreaterThan(
      4.5,
    );
    expect(theme.branding.logoUrl).toBe(logoUrl);
    expect(theme.typography.headingFont).toBe('nunito');
    // Free to publish: no Pro fonts, textures, meshes or shapes.
    expect(requiredFeatures(theme)).toEqual([]);
  });

  it('keeps the form’s layout and components', () => {
    const card: FormTheme = {
      ...base,
      components: { ...base.components, containerStyle: 'card', choiceStyle: 'buttons' },
      layout: { ...base.layout, mode: 'conversational' },
    };
    const theme = suggestThemeFromPalette(card, orange);
    expect(theme.components).toEqual(card.components);
    expect(theme.layout).toEqual(card.layout);
    expect(theme.branding).toEqual(card.branding);
  });

  it.each(INPUT_STYLES)('stays readable with %s fields', (inputStyle) => {
    const theme = suggestThemeFromPalette(
      { ...base, components: { ...base.components, inputStyle } },
      orange,
    );
    expect(themeReadabilityIssues(theme)).toEqual([]);
  });

  it('turns to neutral, corporate fonts for a black-and-grey logo', () => {
    const mono = [
      { color: '#111111', weight: 0.7 },
      { color: '#8A8A8A', weight: 0.3 },
    ];
    const theme = suggestThemeFromPalette(base, mono);
    expect(theme.colors.primary).toBe('#111111');
    expect(theme.typography.headingFont).toBe('manrope');
    expect(themeReadabilityIssues(theme)).toEqual([]);
  });

  it('falls back to the default accent without a palette', () => {
    expect(themeReadabilityIssues(suggestThemeFromPalette(base, []))).toEqual([]);
  });
});
