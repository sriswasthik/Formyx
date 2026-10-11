import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import { contrastRatio, readableTextColor, type FormTheme } from '@formyx/shared';
import satori from 'satori';

/*
 * The picture shown when a form's link is shared (Open Graph, 1200 × 630): the form's title
 * and description on a card, over the theme's background, in its colours. Satori lays it out
 * and turns text into shapes, so no fonts need to be installed; resvg draws the PNG. Titles
 * in Hindi and Telugu use Noto Sans in those scripts.
 */

export const SOCIAL_IMAGE_WIDTH = 1200;
export const SOCIAL_IMAGE_HEIGHT = 630;
const TITLE_MAX_LENGTH = 90;
const DESCRIPTION_MAX_LENGTH = 160;

const require = createRequire(import.meta.url);
const FONT_FILES = [
  { name: 'Inter', weight: 400, file: '@fontsource/inter/files/inter-latin-400-normal.woff' },
  { name: 'Inter', weight: 600, file: '@fontsource/inter/files/inter-latin-600-normal.woff' },
  {
    name: 'Noto Sans Devanagari',
    weight: 600,
    file: '@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-600-normal.woff',
  },
  {
    name: 'Noto Sans Telugu',
    weight: 600,
    file: '@fontsource/noto-sans-telugu/files/noto-sans-telugu-telugu-600-normal.woff',
  },
] as const;

type SatoriFont = Parameters<typeof satori>[1]['fonts'][number];
let fonts: Promise<SatoriFont[]> | null = null;

function loadFonts(): Promise<SatoriFont[]> {
  fonts ??= Promise.all(
    FONT_FILES.map(async ({ name, weight, file }) => ({
      name,
      weight,
      style: 'normal' as const,
      data: await readFile(require.resolve(file)),
    })),
  );
  return fonts;
}

function shorten(text: string, max: number): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max - 1).trimEnd()}…` : single;
}

/** The theme's background as one CSS background: its bottom visible colour or gradient. */
export function backgroundOf(theme: Pick<FormTheme, 'background' | 'colors'>): string {
  const layer = theme.background.layers.find(
    (candidate) => !candidate.hidden && candidate.opacity > 0,
  );
  const stops = (list: { color: string; position: number }[]) =>
    list.map((stop) => `${stop.color} ${stop.position}%`).join(', ');
  switch (layer?.type) {
    case 'solid':
      return layer.color;
    case 'linear':
      return `linear-gradient(${layer.angle}deg, ${stops(layer.stops)})`;
    case 'radial':
      return `radial-gradient(${layer.shape} at ${layer.center.x}% ${layer.center.y}%, ${stops(layer.stops)})`;
    case 'mesh': {
      // Its colours, corner to corner: the mesh, simplified.
      const colors = layer.points.map((point) => point.color);
      return `linear-gradient(135deg, ${colors.join(', ')})`;
    }
    default:
      return theme.colors.containerBackground;
  }
}

/** Plain element objects, as satori takes them (no React needed). */
interface Node {
  type: string;
  key: null;
  props: Record<string, unknown> & { children?: Node | Node[] | string };
}

function el(
  type: string,
  style: Record<string, unknown>,
  children?: Node['props']['children'],
): Node {
  return { type, key: null, props: { style, ...(children !== undefined && { children }) } };
}

export interface SocialImageInput {
  title: string;
  description?: string | undefined;
  theme: Pick<FormTheme, 'background' | 'colors'>;
}

/** The PNG for a form's link previews. */
export async function renderSocialImage({
  title,
  description,
  theme,
}: SocialImageInput): Promise<Buffer> {
  const card = theme.colors.containerBackground;
  const text =
    contrastRatio(theme.colors.text, card) >= 4.5 ? theme.colors.text : readableTextColor(card);
  const muted = contrastRatio(theme.colors.mutedText, card) >= 4.5 ? theme.colors.mutedText : text;
  const accent = theme.colors.primary;
  const shownDescription = description ? shorten(description, DESCRIPTION_MAX_LENGTH) : '';

  const tree = el(
    'div',
    {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: backgroundOf(theme),
      padding: 64,
    },
    el(
      'div',
      {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: card,
        borderRadius: 28,
        padding: '56px 64px',
        borderTop: `10px solid ${accent}`,
      },
      [
        el('div', { display: 'flex', flexDirection: 'column', gap: 20 }, [
          el(
            'div',
            {
              fontSize: 64,
              fontWeight: 600,
              lineHeight: 1.15,
              letterSpacing: -1,
              color: text,
              fontFamily: 'Inter, Noto Sans Devanagari, Noto Sans Telugu',
            },
            shorten(title, TITLE_MAX_LENGTH) || 'Untitled form',
          ),
          ...(shownDescription
            ? [
                el(
                  'div',
                  {
                    fontSize: 30,
                    lineHeight: 1.4,
                    color: muted,
                    fontFamily: 'Inter, Noto Sans Devanagari, Noto Sans Telugu',
                  },
                  shownDescription,
                ),
              ]
            : []),
        ]),
        el(
          'div',
          { display: 'flex', fontSize: 24, fontWeight: 600, color: muted, fontFamily: 'Inter' },
          'Formyx',
        ),
      ],
    ),
  );

  const svg = await satori(tree, {
    width: SOCIAL_IMAGE_WIDTH,
    height: SOCIAL_IMAGE_HEIGHT,
    fonts: await loadFonts(),
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: SOCIAL_IMAGE_WIDTH } }).render().asPng();
}
