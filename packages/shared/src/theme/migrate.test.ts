import { describe, expect, it } from 'vitest';
import { contrastRatio, mixHex, readableTextColor } from '../color.js';
import {
  createDefaultTheme,
  migrateTheme,
  storedFormThemeSchema,
  upgradeStoredTheme,
} from './migrate.js';
import { formThemeSchema } from './schema.js';
import { ACCENT_PRESETS } from './surfaces.js';
import {
  THEME_V1_BACKGROUNDS,
  THEME_V1_FONTS,
  THEME_V1_RADII,
  type FormThemeV1,
} from './theme-v1.js';

/** What v1 drew for each background (apps/web theme-variables.ts in Sprint 7). */
const V1_BACKGROUND_COLORS = { white: '#FFFFFF', off_white: '#F7F6F3', dark: '#18181B' };
const V1_FONT_IDS = { inter: 'inter', serif: 'source-serif-4', rounded: 'nunito' };
const V1_RADII_PX = { sharp: 0, rounded: 10 };

const everyV1Theme: FormThemeV1[] = THEME_V1_BACKGROUNDS.flatMap((background) =>
  THEME_V1_FONTS.flatMap((font) =>
    THEME_V1_RADII.flatMap((radius) =>
      ACCENT_PRESETS.map(({ color }) => ({ accentColor: color, font, radius, background })),
    ),
  ),
);

describe('migrateTheme', () => {
  it.each(everyV1Theme)(
    '$background, $font, $radius, $accentColor: valid v2 that looks the same',
    (v1) => {
      const v2 = migrateTheme(v1);
      expect(formThemeSchema.safeParse(v2).success).toBe(true);

      // The colours v1 worked out from its background, now stored.
      const background = V1_BACKGROUND_COLORS[v1.background];
      const text = readableTextColor(background, '#18181B', '#FAFAFA');
      expect(v2.background.layers).toEqual([
        { id: 'base', type: 'solid', color: background, opacity: 1, blendMode: 'normal' },
      ]);
      expect(v2.overlay.opacity).toBe(0);
      expect(v2.colors).toMatchObject({
        primary: v1.accentColor,
        buttonText: readableTextColor(v1.accentColor, '#18181B', '#FFFFFF'),
        text,
        mutedText: mixHex(text, background, 64),
        containerBackground: background,
        inputBackground: background,
        inputBorder: mixHex(text, background, 26),
      });
      expect(contrastRatio(v2.colors.error, background)).toBeGreaterThanOrEqual(4.5);

      expect(v2.typography).toMatchObject({
        headingFont: V1_FONT_IDS[v1.font],
        bodyFont: V1_FONT_IDS[v1.font],
        baseSize: 16,
        headingWeight: 600,
        letterSpacing: 0,
        textAlign: 'left',
      });
      expect(v2.components).toEqual({
        inputStyle: 'outlined',
        buttonStyle: 'solid',
        radius: V1_RADII_PX[v1.radius],
        containerStyle: 'none',
        shadow: 'none',
        choiceStyle: 'list',
        buttonSize: 'md',
        buttonFullWidth: false,
        buttonArrow: false,
        containerPadding: 'regular',
      });
      expect(v2.layout).toEqual({
        mode: 'classic',
        width: 'regular',
        alignment: 'center',
        logoPosition: 'above_title',
        progress: { style: 'none', position: 'top' },
        autoAdvance: true,
      });
      expect(v2.branding).toEqual({ showFormyxBadge: true });
    },
  );

  it('keeps red-600 errors where they read, and darkens them on off-white', () => {
    const errorOn = (background: FormThemeV1['background']) =>
      migrateTheme({ accentColor: '#4370BD', font: 'inter', radius: 'rounded', background }).colors
        .error;
    expect(errorOn('white')).toBe('#DC2626');
    expect(errorOn('off_white')).toBe('#B91C1C');
    expect(errorOn('dark')).toBe('#F87171');
  });

  it('moves the logo and cover image', () => {
    const v2 = migrateTheme({
      accentColor: '#337B7E',
      font: 'serif',
      radius: 'sharp',
      background: 'off_white',
      logoUrl: 'https://res.cloudinary.com/demo/logo.png',
      coverUrl: 'https://res.cloudinary.com/demo/cover.jpg',
    });
    expect(v2.branding.logoUrl).toBe('https://res.cloudinary.com/demo/logo.png');
    expect(v2.layout.coverImage).toEqual({
      url: 'https://res.cloudinary.com/demo/cover.jpg',
      focalPoint: { x: 50, y: 50 },
    });
  });
});

describe('createDefaultTheme', () => {
  it('is the v1 default, upgraded', () => {
    expect(createDefaultTheme()).toEqual(
      migrateTheme({
        accentColor: '#4370BD',
        font: 'inter',
        radius: 'rounded',
        background: 'white',
      }),
    );
  });

  it('stays as it is (a change here changes every new form)', () => {
    expect(createDefaultTheme()).toMatchInlineSnapshot(`
      {
        "background": {
          "layers": [
            {
              "blendMode": "normal",
              "color": "#FFFFFF",
              "id": "base",
              "opacity": 1,
              "type": "solid",
            },
          ],
        },
        "branding": {
          "showFormyxBadge": true,
        },
        "colors": {
          "buttonText": "#FFFFFF",
          "containerBackground": "#FFFFFF",
          "error": "#DC2626",
          "inputBackground": "#FFFFFF",
          "inputBorder": "#C3C3C4",
          "mutedText": "#6B6B6D",
          "primary": "#4370BD",
          "text": "#18181B",
        },
        "components": {
          "buttonArrow": false,
          "buttonFullWidth": false,
          "buttonSize": "md",
          "buttonStyle": "solid",
          "choiceStyle": "list",
          "containerPadding": "regular",
          "containerStyle": "none",
          "inputStyle": "outlined",
          "radius": 10,
          "shadow": "none",
        },
        "layout": {
          "alignment": "center",
          "autoAdvance": true,
          "logoPosition": "above_title",
          "mode": "classic",
          "progress": {
            "position": "top",
            "style": "none",
          },
          "width": "regular",
        },
        "motion": {
          "animatedBackground": false,
          "pageTransition": "slide",
        },
        "overlay": {
          "blur": 0,
          "color": "#000000",
          "opacity": 0,
        },
        "typography": {
          "baseSize": 16,
          "bodyFont": "inter",
          "headingFont": "inter",
          "headingWeight": 600,
          "letterSpacing": 0,
          "questionNumbering": "none",
          "textAlign": "left",
        },
        "version": 2,
      }
    `);
  });
});

describe('storedFormThemeSchema', () => {
  const v1: FormThemeV1 = {
    accentColor: '#b1563b',
    font: 'rounded',
    radius: 'sharp',
    background: 'dark',
  };

  it('upgrades v1 themes', () => {
    expect(storedFormThemeSchema.parse(v1)).toEqual(
      migrateTheme({ ...v1, accentColor: '#B1563B' }),
    );
  });

  it('takes v2 themes as they are', () => {
    const v2 = createDefaultTheme();
    expect(storedFormThemeSchema.parse(v2)).toEqual(v2);
    expect(upgradeStoredTheme(storedFormThemeSchema.parse(v1))).toEqual(
      storedFormThemeSchema.parse(v1),
    );
  });

  it('reports problems at v2 paths', () => {
    const result = storedFormThemeSchema.safeParse({
      ...createDefaultTheme(),
      colors: { ...createDefaultTheme().colors, text: 'black' },
    });
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['colors.text']);
    expect(() => upgradeStoredTheme({ accentColor: '#FFFFFF' })).toThrow();
  });
});
