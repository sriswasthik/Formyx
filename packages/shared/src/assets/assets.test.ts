import { describe, expect, it } from 'vitest';
import { requiredFeatures } from '../entitlements/theme-features.js';
import { hexColorSchema } from '../color.js';
import { createDefaultTheme } from '../theme/migrate.js';
import { readabilityFixes, themeReadabilityIssues } from '../theme/readability.js';
import { formThemeSchema } from '../theme/schema.js';
import { ASSET_TIERS, type Asset } from './asset.js';
import { FONT_PAIRINGS, pairingTier } from './font-pairings.js';
import { FONT_CATEGORIES, FONT_IDS, FONTS, fontStack, nearestFontWeight } from './fonts.js';
import { GRADIENT_PALETTES } from './palettes.js';
import { applyPreset, matchingPreset, THEME_PRESETS } from './presets.js';
import { blobPath, SHAPES, shapeItemPath } from './shapes.js';
import { isPatternTexture, textureCoverage, textureTile } from './texture-tiles.js';
import { TEXTURES } from './textures.js';

const registries: [string, readonly Asset[]][] = [
  ['fonts', FONTS],
  ['textures', TEXTURES],
  ['shapes', SHAPES],
  ['palettes', GRADIENT_PALETTES],
  ['presets', THEME_PRESETS],
];

describe.each(registries)('the %s registry', (_name, assets) => {
  it('has unique, URL-safe ids', () => {
    const ids = assets.map((asset) => asset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('names a tier, a licence and a source for every asset', () => {
    for (const asset of assets) {
      expect(ASSET_TIERS).toContain(asset.tier);
      expect(asset.name.trim()).not.toBe('');
      expect(asset.category.trim()).not.toBe('');
      expect(asset.license).toMatch(/^(OFL-1\.1|CC0-1\.0)$/);
      expect(asset.source.trim()).not.toBe('');
    }
  });

  it('has something for free plans', () => {
    expect(assets.some((asset) => asset.tier === 'free')).toBe(true);
  });
});

describe('fonts', () => {
  it('give a CSS font stack with fallbacks', () => {
    expect(fontStack('inter')).toBe(
      "'Inter Variable', 'Inter Fallback', ui-sans-serif, system-ui, sans-serif",
    );
    for (const font of FONTS) {
      expect(fontStack(font.id)).toMatch(
        /^'[^']+', '[^']+ Fallback', .+, ((sans-)?serif|cursive|monospace)$/,
      );
    }
  });

  it('are all open-licensed, from Fontsource', () => {
    for (const font of FONTS) {
      expect(font.license).toBe('OFL-1.1');
      expect(font.source).toBe(`https://fontsource.org/fonts/${font.id}`);
    }
  });

  it('offer about forty fonts in every category, a third or so of them Pro', () => {
    expect(FONTS.length).toBeGreaterThanOrEqual(38);
    for (const category of FONT_CATEGORIES) {
      expect(FONTS.filter((font) => font.category === category).length).toBeGreaterThan(1);
    }
    const pro = FONTS.filter((font) => font.tier === 'pro').length;
    expect(pro / FONTS.length).toBeGreaterThan(0.2);
    expect(pro / FONTS.length).toBeLessThan(0.45);
  });

  it('keep the ids and families saved themes already use', () => {
    const shipped = {
      inter: "'Inter Variable'",
      'source-serif-4': "'Source Serif 4 Variable'",
      nunito: "'Nunito Variable'",
      'dm-sans': "'DM Sans Variable'",
      fraunces: "'Fraunces Variable'",
      'playfair-display': "'Playfair Display Variable'",
      'space-grotesk': "'Space Grotesk Variable'",
      'bricolage-grotesque': "'Bricolage Grotesque Variable'",
    } as const;
    for (const [id, family] of Object.entries(shipped)) {
      expect(FONTS.find((font) => font.id === id)?.family).toBe(family);
    }
  });

  it('list their weights, lightest first, and draw others with the nearest', () => {
    for (const font of FONTS) {
      expect(font.weights.length).toBeGreaterThan(0);
      expect([...font.weights].sort((a, b) => a - b)).toEqual(font.weights);
      expect(font.weights).toContain(400);
    }
    expect(nearestFontWeight('inter', 640)).toBe(600);
    expect(nearestFontWeight('inter', 650)).toBe(700);
    expect(nearestFontWeight('patrick-hand', 700)).toBe(400);
    expect(nearestFontWeight('kalam', 600)).toBe(700);
    expect(nearestFontWeight('space-mono', 550)).toBe(700);
  });
});

describe('font pairings', () => {
  it('include the five named styles, each with two real fonts', () => {
    const ids = FONT_PAIRINGS.map((pairing) => pairing.id);
    expect(ids).toEqual(
      expect.arrayContaining(['editorial', 'friendly', 'corporate', 'playful', 'elegant']),
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const pairing of FONT_PAIRINGS) {
      expect(FONT_IDS).toContain(pairing.headingFont);
      expect(FONT_IDS).toContain(pairing.bodyFont);
      expect(nearestFontWeight(pairing.headingFont, pairing.headingWeight)).toBe(
        pairing.headingWeight,
      );
    }
  });

  it('are Pro when either font is', () => {
    expect(pairingTier({ headingFont: 'fraunces', bodyFont: 'inter' })).toBe('pro');
    expect(pairingTier({ headingFont: 'inter', bodyFont: 'caveat' })).toBe('pro');
    expect(pairingTier({ headingFont: 'manrope', bodyFont: 'inter' })).toBe('free');
  });
});

describe('textures', () => {
  it('are drawn in code, or from a WebP photo under textures/', () => {
    for (const texture of TEXTURES) {
      expect(texture.tileSize).toBeGreaterThan(0);
      if (texture.draw.kind === 'photo') {
        expect(texture.draw.file).toBe(`textures/${texture.id}.webp`);
        expect(texture.draw.coverage).toBeGreaterThan(0);
        expect(texture.draw.coverage).toBeLessThan(1);
      } else {
        expect(isPatternTexture(texture.id)).toBe(true);
      }
    }
  });

  it.each(TEXTURES.filter((texture) => texture.draw.kind === 'pattern'))(
    'draws $name as a square SVG tile in black, denser as density rises',
    (texture) => {
      if (!isPatternTexture(texture.id)) throw new Error('Not a pattern');
      const sparse = textureTile(texture.id, 0);
      const dense = textureTile(texture.id, 1);
      expect(sparse.svg).toMatch(
        new RegExp(
          `^<svg xmlns="http://www.w3.org/2000/svg" width="${texture.tileSize}" height="${texture.tileSize}"`,
        ),
      );
      expect(sparse.svg).not.toMatch(/fill="#(?!000)|stroke="#(?!000)/);
      expect(textureTile(texture.id)).toEqual(textureTile(texture.id, 0.5));
      expect(dense.coverage).toBeGreaterThan(sparse.coverage);
      expect(dense.coverage).toBeLessThanOrEqual(1);
      expect(sparse.coverage).toBeGreaterThan(0);
    },
  );

  it('give every photo texture a coverage for the readability check', () => {
    expect(textureCoverage('paper')).toBeGreaterThan(0);
    expect(textureCoverage('dots', 1)).toBeGreaterThan(textureCoverage('dots', 0));
  });
});

describe('shapes', () => {
  it('draw inside the 100 × 100 view box', () => {
    for (const shape of SHAPES) {
      const numbers = shape.path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      expect(numbers.length).toBeGreaterThan(0);
      for (const value of numbers) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('blobPath', () => {
  it('is the same for the same seed and different for another', () => {
    expect(blobPath(42)).toBe(blobPath(42));
    expect(blobPath(42)).not.toBe(blobPath(43));
  });

  it('draws a closed curve inside the view box', () => {
    for (const seed of [0, 1, 99, 123_456, 2_147_483_647]) {
      const path = blobPath(seed);
      expect(path).toMatch(/^M[\d.]+ [\d.]+(C[\d. ]+)+Z$/);
      for (const value of path.match(/\d+(\.\d+)?/g)?.map(Number) ?? []) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it('is used for blobs with a seed, while other shapes keep their drawing', () => {
    expect(shapeItemPath({ type: 'blob', seed: 7 })).toBe(blobPath(7));
    const fixed = SHAPES.find((shape) => shape.id === 'blob')?.path;
    expect(shapeItemPath({ type: 'blob' })).toBe(fixed);
    expect(shapeItemPath({ type: 'star', seed: 7 })).toBe(
      SHAPES.find((shape) => shape.id === 'star')?.path,
    );
  });
});

describe('gradient palettes', () => {
  it('hold four to six hex colours each, enough to seed a mesh', () => {
    for (const palette of GRADIENT_PALETTES) {
      expect(palette.colors.length).toBeGreaterThanOrEqual(4);
      expect(palette.colors.length).toBeLessThanOrEqual(6);
      for (const color of palette.colors) expect(hexColorSchema.parse(color)).toBe(color);
    }
  });
});

describe('theme presets', () => {
  it('offer twelve starting points, free and Pro', () => {
    expect(THEME_PRESETS).toHaveLength(12);
    expect(THEME_PRESETS.filter((preset) => preset.tier === 'free').length).toBeGreaterThan(4);
  });
});

describe.each(THEME_PRESETS)('the $name preset', (preset) => {
  it('is a valid theme', () => {
    expect(formThemeSchema.parse(preset.theme)).toEqual(preset.theme);
  });

  it('is readable: text 4.5:1, primary colour 3:1', () => {
    expect(themeReadabilityIssues(preset.theme)).toEqual([]);
    expect(readabilityFixes(preset.theme)).toEqual([]);
  });

  it('is Pro exactly when it uses a Pro feature', () => {
    expect(preset.tier).toBe(requiredFeatures(preset.theme).length > 0 ? 'pro' : 'free');
  });
});

describe('applyPreset', () => {
  it('keeps the form’s logo, cover image and badge setting', () => {
    const logoUrl = 'https://res.cloudinary.com/demo/logo.png';
    const coverImage = {
      url: 'https://res.cloudinary.com/demo/cover.jpg',
      focalPoint: { x: 50, y: 40 },
    };
    const current = createDefaultTheme();
    const theme = {
      ...current,
      layout: { ...current.layout, coverImage },
      branding: { logoUrl, showFormyxBadge: false },
    };
    const sea = THEME_PRESETS.find((preset) => preset.id === 'sea-glass');
    if (!sea) throw new Error('Preset missing');

    const applied = applyPreset(theme, sea);
    expect(applied.background).toEqual(sea.theme.background);
    expect(applied.layout).toEqual({ ...sea.theme.layout, coverImage });
    expect(applied.branding).toEqual({ logoUrl, showFormyxBadge: false });
    expect(matchingPreset(applied)?.id).toBe('sea-glass');
  });

  it('knows the default theme is Minimal', () => {
    expect(matchingPreset(createDefaultTheme())?.id).toBe('minimal');
  });
});
