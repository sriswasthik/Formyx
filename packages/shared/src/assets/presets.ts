import { mixHex } from '../color.js';
import { createDefaultTheme } from '../theme/migrate.js';
import type { FormTheme } from '../theme/schema.js';
import { buttonTextOn, solidLayer, surfaceColors } from '../theme/surfaces.js';
import { isSameTheme } from '../theme/theme-utils.js';
import { assetIds, FORMYX_LICENSE, FORMYX_SOURCE, type Asset } from './asset.js';

export const PRESET_CATEGORIES = ['plain', 'gradient', 'textured', 'layout'] as const;
export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

export interface ThemePreset<Id extends string = string> extends Asset<Id, PresetCategory> {
  description: string;
  /** The whole look; pickers preview it by drawing it. */
  theme: FormTheme;
}

const base = createDefaultTheme();

const paperSurface = '#F7F6F3';
const midnightSurface = '#11151C';
const seaGlassSurface = '#E6F2EE';
const studioSurface = '#F3EBDD';
const editorialPanel = '#FBFAF7';

const presetThemes = {
  minimal: base,

  paper: {
    ...base,
    background: {
      layers: [
        solidLayer(paperSurface),
        {
          id: 'grain',
          type: 'texture',
          assetId: 'grain',
          scale: 1,
          opacity: 0.22,
          blendMode: 'normal',
        },
      ],
    },
    typography: { ...base.typography, headingFont: 'source-serif-4', bodyFont: 'source-serif-4' },
    colors: {
      ...surfaceColors(paperSurface),
      inputBackground: '#EFEDE7',
      primary: '#337B7E',
      buttonText: buttonTextOn('#337B7E'),
    },
    components: { ...base.components, inputStyle: 'filled', radius: 6 },
  },

  midnight: {
    ...base,
    background: {
      layers: [
        solidLayer(midnightSurface),
        {
          id: 'glow',
          type: 'radial',
          shape: 'ellipse',
          center: { x: 50, y: 0 },
          stops: [
            { color: '#22304A', position: 0 },
            { color: midnightSurface, position: 70 },
          ],
          opacity: 1,
          blendMode: 'normal',
        },
      ],
    },
    colors: {
      ...surfaceColors(midnightSurface),
      inputBackground: '#161B24',
      primary: '#8AB0EA',
      buttonText: buttonTextOn('#8AB0EA'),
    },
    components: { ...base.components, radius: 8 },
  },

  'sea-glass': {
    ...base,
    background: {
      layers: [
        solidLayer(seaGlassSurface),
        {
          id: 'mesh',
          type: 'mesh',
          points: [
            { x: 8, y: 12, color: '#BFE0D6', spread: 55 },
            { x: 88, y: 6, color: '#C9DDEB', spread: 50 },
            { x: 92, y: 88, color: '#9CCBC4', spread: 60 },
            { x: 12, y: 92, color: '#EEF5E9', spread: 55 },
            { x: 50, y: 50, color: '#E6F2EE', spread: 35 },
          ],
          opacity: 1,
          blendMode: 'normal',
        },
      ],
    },
    typography: { ...base.typography, headingFont: 'dm-sans', bodyFont: 'dm-sans' },
    colors: {
      ...surfaceColors('#FFFFFF'),
      inputBackground: '#F2F6F5',
      primary: '#2C6A6E',
      buttonText: buttonTextOn('#2C6A6E'),
    },
    components: {
      inputStyle: 'filled',
      buttonStyle: 'pill',
      radius: 12,
      containerStyle: 'floating',
      shadow: 'md',
    },
    layout: { ...base.layout, mode: 'card' },
    motion: { ...base.motion, animatedBackground: true },
  },

  studio: {
    ...base,
    background: {
      layers: [
        solidLayer(studioSurface),
        {
          id: 'paper',
          type: 'texture',
          assetId: 'paper',
          scale: 1,
          opacity: 0.3,
          blendMode: 'multiply',
        },
        {
          id: 'shapes',
          type: 'shapes',
          items: [
            {
              id: 'blob',
              type: 'blob',
              x: 6,
              y: 14,
              size: 30,
              rotation: -12,
              color: '#E5C9A8',
              opacity: 0.9,
              blur: 0,
            },
            {
              id: 'circle',
              type: 'circle',
              x: 92,
              y: 78,
              size: 18,
              rotation: 0,
              color: '#D9A88A',
              opacity: 0.7,
              blur: 0,
            },
            {
              id: 'sparkle',
              type: 'sparkle',
              x: 86,
              y: 16,
              size: 7,
              rotation: 0,
              color: '#B1563B',
              opacity: 0.85,
              blur: 0,
            },
          ],
          opacity: 1,
          blendMode: 'normal',
        },
      ],
    },
    typography: {
      ...base.typography,
      headingFont: 'bricolage-grotesque',
      headingWeight: 700,
    },
    colors: {
      ...surfaceColors('#FFFDF8'),
      primary: '#A34E34',
      buttonText: buttonTextOn('#A34E34'),
    },
    components: { ...base.components, containerStyle: 'card', shadow: 'sm' },
  },

  editorial: {
    ...base,
    background: {
      layers: [
        {
          id: 'forest',
          type: 'linear',
          angle: 160,
          stops: [
            { color: '#2F5D46', position: 0 },
            { color: '#1F3B2D', position: 100 },
          ],
          opacity: 1,
          blendMode: 'normal',
        },
        {
          id: 'grain',
          type: 'texture',
          assetId: 'grain',
          scale: 1.5,
          opacity: 0.25,
          blendMode: 'overlay',
          tint: '#FFFFFF',
        },
      ],
    },
    typography: {
      ...base.typography,
      headingFont: 'fraunces',
      bodyFont: 'source-serif-4',
      headingWeight: 600,
      letterSpacing: 0,
    },
    colors: {
      ...surfaceColors(editorialPanel),
      inputBorder: mixHex('#1C1917', editorialPanel, 40),
      primary: '#2F5D46',
      buttonText: buttonTextOn('#2F5D46'),
    },
    components: {
      inputStyle: 'underline',
      buttonStyle: 'outline',
      radius: 0,
      containerStyle: 'none',
      shadow: 'none',
    },
    layout: { ...base.layout, mode: 'split', alignment: 'end' },
  },
} satisfies Record<string, FormTheme>;

type PresetId = keyof typeof presetThemes;

/** Ready-made looks. Each one passes `themeReadabilityIssues` and its tier matches its features. */
export const THEME_PRESETS = [
  {
    id: 'minimal',
    name: 'Minimal',
    category: 'plain',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    description: 'White, Inter and a calm blue.',
    theme: presetThemes.minimal,
  },
  {
    id: 'paper',
    name: 'Paper',
    category: 'textured',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    description: 'Warm off-white with a fine grain and a serif.',
    theme: presetThemes.paper,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    category: 'gradient',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    description: 'Deep blue-black with soft light from above.',
    theme: presetThemes.midnight,
  },
  {
    id: 'sea-glass',
    name: 'Sea glass',
    category: 'gradient',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    description: 'A floating card on a slow mesh of greens and blues.',
    theme: presetThemes['sea-glass'],
  },
  {
    id: 'studio',
    name: 'Studio',
    category: 'textured',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    description: 'Sand paper, playful shapes and a bold grotesque.',
    theme: presetThemes.studio,
  },
  {
    id: 'editorial',
    name: 'Editorial',
    category: 'layout',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    description: 'Split page, forest green and Fraunces headings.',
    theme: presetThemes.editorial,
  },
] as const satisfies readonly ThemePreset<PresetId>[];

export type ThemePresetId = (typeof THEME_PRESETS)[number]['id'];
export const THEME_PRESET_IDS = assetIds(THEME_PRESETS);

/**
 * `theme` restyled as the preset. What belongs to the form rather than its look stays: the
 * logo, the cover image and whether "Made with Formyx" shows.
 */
export function applyPreset(theme: FormTheme, preset: Pick<ThemePreset, 'theme'>): FormTheme {
  const { coverImage: _presetCover, ...layout } = preset.theme.layout;
  return {
    ...preset.theme,
    layout: {
      ...layout,
      ...(theme.layout.coverImage && { coverImage: theme.layout.coverImage }),
    },
    branding: theme.branding,
  };
}

/** The preset the theme is exactly, apart from the form's own logo, cover and badge. */
export function matchingPreset(theme: FormTheme): ThemePreset<ThemePresetId> | null {
  return THEME_PRESETS.find((preset) => isSameTheme(applyPreset(theme, preset), theme)) ?? null;
}
