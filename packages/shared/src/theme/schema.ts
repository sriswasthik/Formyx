import { z } from 'zod';
import { fontIdSchema } from '../assets/fonts.js';
import { shapeIdSchema } from '../assets/shapes.js';
import { textureIdSchema } from '../assets/textures.js';
import { hexColorSchema } from '../color.js';
import { NODE_ID_PATTERN } from '../forms/ids.js';
import { httpsImageUrlSchema } from './images.js';

/**
 * How a form looks to respondents, version 2. Edited with the draft and copied to
 * `publishedTheme` on publish, so respondents only see a new look once it is published.
 * Unlike the builder app, these looks may be as expressive as creators like; the presets we
 * ship pass the readability checks in `readability.ts`.
 */
export const THEME_VERSION = 2;

const unit = z.number().min(0, 'Use 0 or more').max(1, 'Use 1 or less');
const percent = z.number().min(0, 'Use 0% or more').max(100, 'Use 100% or less');
const nodeId = z.string().regex(NODE_ID_PATTERN, 'Use letters, digits, - and _');

/** A position inside the area being drawn, in percent from the top left. */
const pointSchema = z.object({ x: percent, y: percent });
export type ThemePoint = z.infer<typeof pointSchema>;

/** CSS `mix-blend-mode` values. */
export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;
export const blendModeSchema = z.enum(BLEND_MODES);
export type BlendMode = z.infer<typeof blendModeSchema>;

/** What every background layer has. */
const layerBase = z.object({
  /** Unique within the theme; keeps a layer's identity while layers are reordered. */
  id: nodeId,
  opacity: unit,
  blendMode: blendModeSchema,
  /** Kept in the theme but not drawn. Absent means shown. */
  hidden: z.boolean().optional(),
});

/** Seeds for generated shapes and scatters: a 31-bit non-negative integer. */
export const seedSchema = z.number().int().min(0).max(2_147_483_647);

const gradientStopSchema = z.object({ color: hexColorSchema, position: percent });
export type GradientStop = z.infer<typeof gradientStopSchema>;
const gradientStops = z
  .array(gradientStopSchema)
  .min(2, 'Use at least 2 colours')
  .max(6, 'Use 6 colours or fewer');

export const MESH_MIN_POINTS = 4;
export const MESH_MAX_POINTS = 8;
export const MAX_SHAPES = 48;
export const MAX_LAYERS = 8;

const meshPointSchema = z.object({
  x: percent,
  y: percent,
  color: hexColorSchema,
  /** How far the colour reaches, in percent of the larger side. */
  spread: z.number().min(10, 'Use 10% or more').max(100, 'Use 100% or less'),
});
export type MeshPoint = z.infer<typeof meshPointSchema>;

export const SHAPE_SIZE_MAX = 100;

const shapeItemSchema = z.object({
  id: nodeId,
  type: shapeIdSchema,
  x: percent,
  y: percent,
  /** Width in percent of the area's width. */
  size: z.number().min(2, 'Use 2% or more').max(SHAPE_SIZE_MAX, 'Use 100% or less'),
  /** Degrees clockwise. */
  rotation: z.number().min(-180).max(180),
  color: hexColorSchema,
  opacity: unit,
  /** Blur radius in CSS pixels. */
  blur: z.number().min(0).max(64),
  /** Varies generated shapes (blobs); the shape's fixed drawing if not set. */
  seed: seedSchema.optional(),
});
export type ThemeShape = z.infer<typeof shapeItemSchema>;

export const backgroundLayerSchema = z.discriminatedUnion('type', [
  layerBase.extend({ type: z.literal('solid'), color: hexColorSchema }),
  layerBase.extend({
    type: z.literal('linear'),
    /** Degrees, as in CSS: 0 points up, 90 to the right. */
    angle: z.number().min(0).max(360),
    stops: gradientStops,
  }),
  layerBase.extend({
    type: z.literal('radial'),
    shape: z.enum(['circle', 'ellipse']),
    center: pointSchema,
    stops: gradientStops,
  }),
  layerBase.extend({
    type: z.literal('mesh'),
    points: z
      .array(meshPointSchema)
      .min(MESH_MIN_POINTS, `Use at least ${MESH_MIN_POINTS} colour points`)
      .max(MESH_MAX_POINTS, `Use ${MESH_MAX_POINTS} colour points or fewer`),
  }),
  layerBase.extend({
    type: z.literal('texture'),
    assetId: textureIdSchema,
    /** Tile size relative to the texture's own. */
    scale: z.number().min(0.25).max(4),
    /** The texture's colour; the theme's text colour if not set. */
    tint: hexColorSchema.optional(),
    /** How much of the tile the pattern covers, for textures drawn in code; 0.5 if not set. */
    density: unit.optional(),
  }),
  layerBase.extend({
    type: z.literal('shapes'),
    items: z
      .array(shapeItemSchema)
      .min(1, 'Add at least one shape')
      .max(MAX_SHAPES, `Use ${MAX_SHAPES} shapes or fewer`),
    /** The seed the shapes were last scattered with, so "Scatter" moves on from it. */
    seed: seedSchema.optional(),
    /** Left out on narrow screens, where shapes would sit behind the text. */
    hideOnMobile: z.boolean().optional(),
  }),
  layerBase.extend({
    type: z.literal('image'),
    url: httpsImageUrlSchema,
    /** The part of the image kept in view when it is cropped. */
    focalPoint: pointSchema,
    fit: z.enum(['cover', 'contain']),
  }),
]);
export type BackgroundLayer = z.infer<typeof backgroundLayerSchema>;
export type BackgroundLayerType = BackgroundLayer['type'];

export const INPUT_STYLES = ['outlined', 'filled', 'underline', 'pill', 'minimal'] as const;
export const BUTTON_STYLES = ['solid', 'outline', 'soft', 'pill'] as const;
export const CONTAINER_STYLES = ['none', 'card', 'floating', 'bordered'] as const;
export const SHADOW_LEVELS = ['none', 'sm', 'md', 'lg'] as const;
export const LAYOUT_MODES = ['classic', 'card', 'split', 'conversational'] as const;
export const LAYOUT_WIDTHS = ['narrow', 'regular', 'wide'] as const;
export const LAYOUT_ALIGNMENTS = ['start', 'center', 'end'] as const;
export const LOGO_POSITIONS = ['above_title', 'top_left', 'top_center'] as const;
export const PAGE_TRANSITIONS = ['none', 'fade', 'slide'] as const;
export const TEXT_ALIGNS = ['left', 'center'] as const;
/** How questions are numbered: not at all, 1. 2. 3., or A. B. C. */
export const QUESTION_NUMBERING = ['none', 'number', 'letter'] as const;
/** Single and multiple choice: a list of rows, bordered cards, wrapped pills or buttons. */
export const CHOICE_STYLES = ['list', 'cards', 'pills', 'buttons'] as const;
export const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;
export const CONTAINER_PADDINGS = ['compact', 'regular', 'spacious'] as const;
export const PROGRESS_STYLES = ['none', 'line', 'steps', 'percentage'] as const;
export const PROGRESS_POSITIONS = ['top', 'bottom'] as const;

export const RADIUS_MAX = 24;
export const CONTAINER_RADIUS_MAX = 40;

/** The form column's largest width for each layout width, in CSS pixels. */
export const LAYOUT_WIDTHS_PX: Record<(typeof LAYOUT_WIDTHS)[number], number> = {
  narrow: 560,
  regular: 640,
  wide: 760,
};

/** The theme's colours. Brand kits carry them too. */
export const themeColorsSchema = z.object({
  /** Buttons, selected choices, links and focus rings. */
  primary: hexColorSchema,
  text: hexColorSchema,
  mutedText: hexColorSchema,
  /** Behind the form when it sits in a container, and behind the split layout's form side. */
  containerBackground: hexColorSchema,
  inputBackground: hexColorSchema,
  inputBorder: hexColorSchema,
  /** Text on `primary`. */
  buttonText: hexColorSchema,
  error: hexColorSchema,
});

export const formThemeSchema = z
  .object({
    version: z.literal(THEME_VERSION),
    background: z.object({
      /** Drawn bottom first. */
      layers: z
        .array(backgroundLayerSchema)
        .min(1, 'Add a background layer')
        .max(MAX_LAYERS, `Use ${MAX_LAYERS} layers or fewer`),
    }),
    /** A wash over the background that keeps the form readable over busy layers. */
    overlay: z.object({
      color: hexColorSchema,
      opacity: unit,
      /** Backdrop blur in CSS pixels. */
      blur: z.number().min(0).max(24),
    }),
    typography: z.object({
      headingFont: fontIdSchema,
      bodyFont: fontIdSchema,
      /** Body text size in CSS pixels; headings and labels scale with it. */
      baseSize: z.number().int().min(14, 'Use 14px or more').max(20, 'Use 20px or less'),
      headingWeight: z.number().int().min(300).max(900).multipleOf(100),
      /** Added to every letter, in em. Headings stay a touch tighter than body text. */
      letterSpacing: z.number().min(-0.05).max(0.1),
      textAlign: z.enum(TEXT_ALIGNS),
      // Settings added after v2 shipped have defaults, so themes saved before them still read.
      questionNumbering: z.enum(QUESTION_NUMBERING).default('none'),
    }),
    colors: themeColorsSchema,
    components: z.object({
      inputStyle: z.enum(INPUT_STYLES),
      buttonStyle: z.enum(BUTTON_STYLES),
      /** Corner radius of inputs and buttons in CSS pixels; containers round a little more. */
      radius: z.number().int().min(0).max(RADIUS_MAX),
      containerStyle: z.enum(CONTAINER_STYLES),
      shadow: z.enum(SHADOW_LEVELS),
      choiceStyle: z.enum(CHOICE_STYLES).default('list'),
      buttonSize: z.enum(BUTTON_SIZES).default('md'),
      /** The submit and next buttons span the form's width. */
      buttonFullWidth: z.boolean().default(false),
      /** An arrow after the submit and next buttons' text. */
      buttonArrow: z.boolean().default(false),
      containerPadding: z.enum(CONTAINER_PADDINGS).default('regular'),
      /** The container's corner radius in CSS pixels; a little more than `radius` if not set. */
      containerRadius: z.number().int().min(0).max(CONTAINER_RADIUS_MAX).optional(),
    }),
    layout: z.object({
      mode: z.enum(LAYOUT_MODES),
      width: z.enum(LAYOUT_WIDTHS),
      /** Where the form sits across wide screens; in the split layout, which side it takes. */
      alignment: z.enum(LAYOUT_ALIGNMENTS),
      logoPosition: z.enum(LOGO_POSITIONS),
      /** A wide image across the top of the form. */
      coverImage: z.object({ url: httpsImageUrlSchema, focalPoint: pointSchema }).optional(),
      /** How far along respondents are: hidden, a line, numbered steps or a percentage. */
      progress: z
        .object({ style: z.enum(PROGRESS_STYLES), position: z.enum(PROGRESS_POSITIONS) })
        .default({ style: 'none', position: 'top' }),
      /** Conversational forms move on once a single choice, rating or dropdown is answered. */
      autoAdvance: z.boolean().default(true),
    }),
    /** Always off for people who ask their device for reduced motion. */
    motion: z.object({
      pageTransition: z.enum(PAGE_TRANSITIONS),
      /** A slow drift of gradient and shape layers. */
      animatedBackground: z.boolean(),
    }),
    branding: z.object({
      /** Shown with the title, where `layout.logoPosition` says. */
      logoUrl: httpsImageUrlSchema.optional(),
      /** "Made with Formyx" under the form. Hiding it takes the remove_branding feature. */
      showFormyxBadge: z.boolean(),
    }),
  })
  .superRefine((theme, ctx) => {
    const layerIds = new Set<string>();
    theme.background.layers.forEach((layer, index) => {
      if (layerIds.has(layer.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['background', 'layers', index, 'id'],
          message: 'Another layer already uses this id',
        });
      }
      layerIds.add(layer.id);

      if (layer.type !== 'shapes') return;
      const shapeIds = new Set<string>();
      layer.items.forEach((item, itemIndex) => {
        if (shapeIds.has(item.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['background', 'layers', index, 'items', itemIndex, 'id'],
            message: 'Another shape already uses this id',
          });
        }
        shapeIds.add(item.id);
      });
    });
  });
export type FormTheme = z.infer<typeof formThemeSchema>;
export type ThemeColors = FormTheme['colors'];
export type ThemeTypography = FormTheme['typography'];
export type ThemeComponents = FormTheme['components'];
export type ThemeLayout = FormTheme['layout'];
export type LayoutMode = ThemeLayout['mode'];
