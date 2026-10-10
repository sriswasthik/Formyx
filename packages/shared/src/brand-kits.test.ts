import { describe, expect, it } from 'vitest';
import { THEME_PRESETS } from './assets/presets.js';
import {
  applyBrandKit,
  brandKitDataSchema,
  brandKitFromTheme,
  brandKitInputSchema,
  brandKitUpdateSchema,
} from './brand-kits.js';
import { createDefaultTheme } from './theme/migrate.js';
import { themeReadabilityIssues } from './theme/readability.js';
import { formThemeSchema, type FormTheme } from './theme/schema.js';
import { solidLayer } from './theme/surfaces.js';

const base = createDefaultTheme();
const logoUrl = 'https://res.cloudinary.com/demo/logo.png';

function preset(id: string): FormTheme {
  const found = THEME_PRESETS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No preset ${id}`);
  return found.theme;
}

describe('brandKitFromTheme', () => {
  it('keeps the colours, fonts and logo, and the plain colour the form sits on', () => {
    const midnight = { ...preset('midnight'), branding: { logoUrl, showFormyxBadge: true } };
    const kit = brandKitFromTheme(midnight);
    expect(brandKitDataSchema.parse(kit)).toEqual(kit);
    expect(kit).toMatchObject({
      colors: midnight.colors,
      headingFont: midnight.typography.headingFont,
      bodyFont: midnight.typography.bodyFont,
      logoUrl,
    });
    // Midnight is a gradient: the kit falls back to its container colour.
    expect(kit.surface).toBe(midnight.colors.containerBackground);
    expect(brandKitFromTheme(base).surface).toBe('#FFFFFF');
  });

  it('stores a heading weight the heading font has', () => {
    const theme: FormTheme = {
      ...base,
      typography: { ...base.typography, headingFont: 'patrick-hand', headingWeight: 700 },
    };
    expect(brandKitFromTheme(theme).headingWeight).toBe(400);
  });
});

describe('applyBrandKit', () => {
  const dark = brandKitFromTheme({
    ...preset('midnight'),
    background: { layers: [solidLayer('#11151C')] },
  });

  it('gives a plain form the kit’s colours, fonts, logo and plain colour, readably', () => {
    const applied = applyBrandKit(base, { ...dark, logoUrl });
    expect(formThemeSchema.parse(applied)).toEqual(applied);
    expect(applied.colors).toEqual(dark.colors);
    expect(applied.background.layers).toEqual([
      { id: 'base', type: 'solid', color: '#11151C', opacity: 1, blendMode: 'normal' },
    ]);
    expect(applied.branding.logoUrl).toBe(logoUrl);
    expect(themeReadabilityIssues(applied)).toEqual([]);
  });

  it('leaves a richer background, the layout and the form’s own logo alone', () => {
    const sea = { ...preset('sea-glass'), branding: { logoUrl, showFormyxBadge: false } };
    const applied = applyBrandKit(sea, brandKitFromTheme(preset('paper')));
    expect(applied.background).toEqual(sea.background);
    expect(applied.layout).toEqual(sea.layout);
    expect(applied.components).toEqual(sea.components);
    expect(applied.branding).toEqual({ logoUrl, showFormyxBadge: false });
    expect(applied.typography.headingFont).toBe('source-serif-4');
  });

  it('turns a theme back into the same kit', () => {
    const kit = brandKitFromTheme(preset('paper'));
    expect(brandKitFromTheme(applyBrandKit(base, kit))).toEqual(kit);
  });
});

describe('brand kit input', () => {
  it('needs a name and a valid kit', () => {
    const kit = brandKitFromTheme(base);
    expect(brandKitInputSchema.safeParse({ name: '  Acme  ', kit }).data?.name).toBe('Acme');
    expect(brandKitInputSchema.safeParse({ name: ' ', kit }).success).toBe(false);
    expect(
      brandKitInputSchema.safeParse({ name: 'Acme', kit: { ...kit, headingFont: 'comic-sans' } })
        .success,
    ).toBe(false);
  });

  it('takes a change to the name, the kit or both, but not nothing', () => {
    expect(brandKitUpdateSchema.safeParse({ name: 'New name' }).success).toBe(true);
    expect(brandKitUpdateSchema.safeParse({}).success).toBe(false);
  });
});
