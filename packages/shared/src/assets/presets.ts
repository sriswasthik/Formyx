import { mixHex } from '../color.js';
import { meshFromPalette } from '../theme/mesh.js';
import { createDefaultTheme } from '../theme/migrate.js';
import { SCATTER_RECIPES, shapesFromRecipe, type ScatterRecipeId } from '../theme/scatter.js';
import type { FormTheme } from '../theme/schema.js';
import { buttonTextOn, solidLayer, surfaceColors } from '../theme/surfaces.js';
import { isSameTheme } from '../theme/theme-utils.js';
import { assetIds, FORMYX_LICENSE, FORMYX_SOURCE, type Asset } from './asset.js';
import { getPalette } from './palettes.js';

export const PRESET_CATEGORIES = ['plain', 'gradient', 'textured', 'shapes', 'layout'] as const;
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
const sunriseSurface = '#FFF1E6';
const blueprintSurface = '#1D3557';
const confettiSurface = '#FFF8EC';
const botanicalSurface = '#1E3B2F';
const pastelSurface = '#FDF8F3';
const monoSurface = '#FAFAFA';

function recipe(id: ScatterRecipeId) {
  const found = SCATTER_RECIPES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown recipe: ${id}`);
  return found;
}

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

  'sunrise-mesh': {
    ...base,
    background: {
      layers: [
        solidLayer(sunriseSurface),
        {
          id: 'mesh',
          type: 'mesh',
          points: meshFromPalette(getPalette('sunset').colors, 21),
          opacity: 1,
          blendMode: 'normal',
        },
        {
          id: 'grain',
          type: 'texture',
          assetId: 'grain',
          scale: 1,
          density: 0.4,
          opacity: 0.18,
          blendMode: 'soft-light',
          tint: '#7C2D12',
        },
      ],
    },
    typography: { ...base.typography, headingFont: 'fraunces', headingWeight: 600 },
    colors: {
      ...surfaceColors('#FFFFFF'),
      inputBackground: '#FFF8F3',
      primary: '#B5452B',
      buttonText: buttonTextOn('#B5452B'),
    },
    components: {
      inputStyle: 'filled',
      buttonStyle: 'pill',
      radius: 12,
      containerStyle: 'floating',
      shadow: 'lg',
    },
    layout: { ...base.layout, mode: 'card' },
    motion: { ...base.motion, animatedBackground: true },
  },

  blueprint: {
    ...base,
    background: {
      layers: [
        solidLayer(blueprintSurface),
        {
          id: 'grid-fine',
          type: 'texture',
          assetId: 'grid',
          scale: 0.75,
          density: 0,
          opacity: 0.1,
          blendMode: 'normal',
          tint: '#FFFFFF',
        },
        {
          id: 'grid-major',
          type: 'texture',
          assetId: 'grid',
          scale: 3,
          density: 0.3,
          opacity: 0.14,
          blendMode: 'normal',
          tint: '#FFFFFF',
        },
      ],
    },
    typography: {
      ...base.typography,
      headingFont: 'dm-sans',
      bodyFont: 'dm-sans',
      headingWeight: 700,
    },
    colors: {
      ...surfaceColors(blueprintSurface),
      inputBackground: '#21406A',
      inputBorder: '#7F9CC4',
      primary: '#F2C94C',
      buttonText: buttonTextOn('#F2C94C'),
    },
    components: { ...base.components, radius: 2 },
  },

  'confetti-party': {
    ...base,
    background: {
      layers: [
        solidLayer(confettiSurface),
        shapesFromRecipe(recipe('confetti'), getPalette('bold').colors, 2024, 'confetti'),
      ],
    },
    typography: {
      ...base.typography,
      headingFont: 'nunito',
      bodyFont: 'nunito',
      headingWeight: 800,
    },
    colors: {
      ...surfaceColors('#FFFFFF'),
      primary: '#2349C9',
      buttonText: buttonTextOn('#2349C9'),
    },
    components: {
      inputStyle: 'outlined',
      buttonStyle: 'pill',
      radius: 14,
      containerStyle: 'card',
      shadow: 'md',
    },
    layout: { ...base.layout, mode: 'card' },
  },

  botanical: {
    ...base,
    background: {
      layers: [
        {
          id: 'forest',
          type: 'linear',
          angle: 200,
          stops: [
            { color: '#25483A', position: 0 },
            { color: botanicalSurface, position: 100 },
          ],
          opacity: 1,
          blendMode: 'normal',
        },
        {
          id: 'contours',
          type: 'texture',
          assetId: 'topographic',
          scale: 1.25,
          density: 0.5,
          opacity: 0.1,
          blendMode: 'normal',
          tint: '#D8E8C8',
        },
        {
          ...shapesFromRecipe(recipe('blobs'), ['#244536', '#21402F', '#284A3A'], 7, 'leaves'),
          hideOnMobile: true,
        },
      ],
    },
    typography: {
      ...base.typography,
      headingFont: 'fraunces',
      bodyFont: 'dm-sans',
      headingWeight: 500,
      letterSpacing: 0,
    },
    colors: {
      ...surfaceColors(botanicalSurface),
      mutedText: '#C5D0CA',
      error: '#FECACA',
      inputBackground: '#24463A',
      inputBorder: '#7FA08E',
      primary: '#E9C46A',
      buttonText: buttonTextOn('#E9C46A'),
    },
    components: { ...base.components, radius: 10 },
  },

  'pastel-blobs': {
    ...base,
    background: {
      layers: [
        solidLayer(pastelSurface),
        {
          ...shapesFromRecipe(recipe('blobs'), getPalette('soft-pastel').colors, 31, 'blobs'),
          hideOnMobile: true,
        },
      ],
    },
    typography: {
      ...base.typography,
      headingFont: 'nunito',
      bodyFont: 'nunito',
      headingWeight: 800,
    },
    colors: {
      ...surfaceColors(pastelSurface),
      error: '#B91C1C',
      inputBackground: '#FFFFFF',
      primary: '#B15171',
      buttonText: buttonTextOn('#B15171'),
    },
    components: { ...base.components, buttonStyle: 'pill', radius: 16 },
  },

  'minimal-mono': {
    ...base,
    background: {
      layers: [
        solidLayer(monoSurface),
        {
          id: 'dots',
          type: 'texture',
          assetId: 'dots',
          scale: 1,
          density: 0.15,
          opacity: 0.12,
          blendMode: 'normal',
        },
      ],
    },
    typography: { ...base.typography, headingWeight: 700, letterSpacing: -0.01 },
    colors: {
      ...surfaceColors(monoSurface),
      primary: '#18181B',
      buttonText: buttonTextOn('#18181B'),
    },
    components: {
      inputStyle: 'underline',
      buttonStyle: 'solid',
      radius: 0,
      containerStyle: 'none',
      shadow: 'none',
    },
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
  {
    id: 'sunrise-mesh',
    name: 'Sunrise mesh',
    category: 'gradient',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    description: 'A warm, drifting mesh behind a floating card.',
    theme: presetThemes['sunrise-mesh'],
  },
  {
    id: 'blueprint',
    name: 'Blueprint grid',
    category: 'textured',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    description: 'Drafting blue with fine and major grid lines.',
    theme: presetThemes.blueprint,
  },
  {
    id: 'confetti-party',
    name: 'Confetti party',
    category: 'shapes',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    description: 'Bright confetti around a friendly card.',
    theme: presetThemes['confetti-party'],
  },
  {
    id: 'botanical',
    name: 'Botanical',
    category: 'textured',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    description: 'Deep greens, contour lines and leafy shapes.',
    theme: presetThemes.botanical,
  },
  {
    id: 'pastel-blobs',
    name: 'Pastel blobs',
    category: 'shapes',
    tier: 'pro',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    description: 'Soft pastel blobs and a rounded typeface.',
    theme: presetThemes['pastel-blobs'],
  },
  {
    id: 'minimal-mono',
    name: 'Minimal mono',
    category: 'plain',
    tier: 'free',
    license: FORMYX_LICENSE,
    source: FORMYX_SOURCE,
    description: 'Black on white, underlined fields and a faint dot grid.',
    theme: presetThemes['minimal-mono'],
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
