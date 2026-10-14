/*
 * The Formyx logo's shapes and the SVG text built from them: one source for the <Logo>
 * component and for the files `pnpm --filter @formyx/e2e render:images` writes (favicons, app
 * icons, the email logo). That script imports this file with Node's type stripping, so it
 * imports nothing and uses only erasable TypeScript.
 *
 * The logo is an "F" made of three form elements, left-aligned on a 32×32 grid: a long input,
 * a short input and a checkbox.
 */

/** A rounded rectangle on the logo's 32×32 grid. */
export interface LogoRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
}

/** The logo as designed, drawn at larger sizes. */
export const LOGO_SHAPES: readonly LogoRect[] = [
  { x: 8, y: 7.5, width: 16, height: 4.5, rx: 2.25 },
  { x: 8, y: 13.75, width: 11, height: 4.5, rx: 2.25 },
  { x: 8, y: 20, width: 4.5, height: 4.5, rx: 1.25 },
];

/**
 * The same logo snapped to whole pixels at 16, 32 and 48px (2px bars and 1px gaps at 16px), so
 * small sizes stay crisp instead of blurring on half pixels.
 */
export const LOGO_SHAPES_SMALL: readonly LogoRect[] = [
  { x: 8, y: 8, width: 16, height: 4, rx: 2 },
  { x: 8, y: 14, width: 12, height: 4, rx: 2 },
  { x: 8, y: 20, width: 4, height: 4, rx: 1 },
];

/** Sizes (in device-independent px) below this draw the snapped shapes. */
export const SMALL_LOGO_BELOW = 32;

/** The corner radius of the icon's rounded square. */
export const ICON_RADIUS = 8;

/**
 * How much smaller the mark is on a maskable app icon, which the platform crops to a circle or
 * squircle: it keeps the mark well inside the safe zone (a circle 80% of the icon's width).
 */
export const MASKABLE_SCALE = 0.8;

/** The shapes to draw at `size` px. */
export function logoShapes(size: number): readonly LogoRect[] {
  return size < SMALL_LOGO_BELOW ? LOGO_SHAPES_SMALL : LOGO_SHAPES;
}

/** Light-theme colours, matching the app's zinc tokens. */
export const BRAND_COLOR = {
  ink: '#18181b',
  paper: '#fafafa',
} as const;

function rectElement(shape: LogoRect, attributes: string): string {
  return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="${shape.rx}"${attributes}/>`;
}

export interface LogoSvgOptions {
  shapes: readonly LogoRect[];
  /** Pixel width and height of the image. */
  size: number;
  /** The rounded square behind the mark; leave out for the mark alone. */
  tile?: { fill: string; radius: number };
  fill: string;
  /**
   * Scales the mark about the centre, such as 0.8 for a maskable icon, whose outer edge
   * the platform may crop.
   */
  scale?: number;
}

/** A standalone SVG of the mark, alone or on its square. */
export function logoSvg({ shapes, size, tile, fill, scale = 1 }: LogoSvgOptions): string {
  const transform =
    scale === 1 ? '' : ` transform="translate(16 16) scale(${scale}) translate(-16 -16)"`;
  const background = tile
    ? `<rect width="32" height="32" rx="${tile.radius}" fill="${tile.fill}"/>`
    : '';
  const marks = shapes.map((shape) => rectElement(shape, '')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${background}<g fill="${fill}"${transform}>${marks}</g></svg>`;
}

/**
 * public/favicon.svg: the icon in the snapped shapes (browsers draw favicons at 16 or 32px),
 * inverted for a dark browser theme.
 */
export function faviconSvg(): string {
  const marks = LOGO_SHAPES_SMALL.map((shape) => `  ${rectElement(shape, ' class="mark"')}`);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    '  <style>',
    `    .tile { fill: ${BRAND_COLOR.ink}; }`,
    `    .mark { fill: ${BRAND_COLOR.paper}; }`,
    '    @media (prefers-color-scheme: dark) {',
    `      .tile { fill: ${BRAND_COLOR.paper}; }`,
    `      .mark { fill: ${BRAND_COLOR.ink}; }`,
    '    }',
    '  </style>',
    `  <rect class="tile" width="32" height="32" rx="${ICON_RADIUS}"/>`,
    ...marks,
    '</svg>',
    '',
  ].join('\n');
}
