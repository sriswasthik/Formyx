import { describe, expect, it } from 'vitest';
import {
  ACCENT_PRESETS,
  accentHasEnoughContrast,
  contrastRatio,
  createDefaultTheme,
  FORM_BACKGROUND_COLORS,
  formThemeSchema,
  isSameTheme,
} from './theme.js';

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // #767676 is the classic "just passes 4.5:1 on white" grey.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });

  it('does not care about the order', () => {
    expect(contrastRatio('#4370BD', '#FFFFFF')).toBe(contrastRatio('#FFFFFF', '#4370BD'));
  });
});

describe('ACCENT_PRESETS', () => {
  it.each(ACCENT_PRESETS)(
    '$label reads as text on light backgrounds and stands out on dark',
    ({ color }) => {
      expect(contrastRatio(color, FORM_BACKGROUND_COLORS.white)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(color, FORM_BACKGROUND_COLORS.off_white)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(color, FORM_BACKGROUND_COLORS.dark)).toBeGreaterThanOrEqual(3);
    },
  );

  it('offers eight distinct colours', () => {
    expect(new Set(ACCENT_PRESETS.map(({ color }) => color)).size).toBe(8);
  });
});

describe('accentHasEnoughContrast', () => {
  it('warns about accents that fade into the background', () => {
    expect(accentHasEnoughContrast({ accentColor: '#4370BD', background: 'white' })).toBe(true);
    expect(accentHasEnoughContrast({ accentColor: '#F0E68C', background: 'white' })).toBe(false);
    expect(accentHasEnoughContrast({ accentColor: '#1E2A3A', background: 'dark' })).toBe(false);
  });
});

describe('formThemeSchema', () => {
  it('accepts the default theme', () => {
    expect(formThemeSchema.parse(createDefaultTheme())).toEqual(createDefaultTheme());
  });

  it('stores hex colours in capitals, so equal colours compare equal', () => {
    const theme = formThemeSchema.parse({ ...createDefaultTheme(), accentColor: '#4370bd' });
    expect(theme.accentColor).toBe('#4370BD');
  });

  it.each([
    ['a short hex', { accentColor: '#47b' }],
    ['a font it does not offer', { font: 'mono' }],
    ['a radius it does not offer', { radius: 'medium' }],
    ['a background it does not offer', { background: '#FFFFFF' }],
    ['an image over plain http', { logoUrl: 'http://example.com/logo.png' }],
  ])('refuses %s', (_case, change) => {
    expect(formThemeSchema.safeParse({ ...createDefaultTheme(), ...change }).success).toBe(false);
  });
});

describe('isSameTheme', () => {
  it('compares every setting, ignoring hex case', () => {
    const theme = createDefaultTheme();
    expect(isSameTheme(theme, { ...theme, accentColor: theme.accentColor.toLowerCase() })).toBe(
      true,
    );
    expect(isSameTheme(theme, { ...theme, radius: 'sharp' })).toBe(false);
    expect(isSameTheme(theme, { ...theme, logoUrl: 'https://res.cloudinary.com/x/logo.png' })).toBe(
      false,
    );
  });
});
