/* eslint-disable no-console -- a command-line tool: it prints what it wrote. */
// Writes the web app's static images: the favicons, app icons and email logo from the logo's
// shapes (apps/web/src/components/brand/logo-geometry.ts, imported with Node's type stripping),
// and public/og-image.png (link previews) from apps/web/design/og-image.html.
// Usage: pnpm --filter @formyx/e2e render:images
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import {
  BRAND_COLOR,
  faviconSvg,
  ICON_RADIUS,
  LOGO_SHAPES,
  LOGO_SHAPES_SMALL,
  logoShapes,
  logoSvg,
  MASKABLE_SCALE,
} from '../../apps/web/src/components/brand/logo-geometry.ts';

const web = join(import.meta.dirname, '..', '..', 'apps', 'web');
const pub = (file) => join(web, 'public', file);
const inter = join(
  web,
  'node_modules',
  '@fontsource-variable',
  'inter',
  'files',
  'inter-latin-wght-normal.woff2',
);
const fontFace = `@font-face { font-family: 'Inter Variable'; font-weight: 100 900;
  src: url(data:font/woff2;base64,${readFileSync(inter).toString('base64')}) format('woff2'); }`;

/** The icon on its rounded square, as the app draws it in light mode. */
const tile = { fill: BRAND_COLOR.ink, radius: ICON_RADIUS };
/** Full-bleed, for platforms that round or crop the corners themselves. */
const square = { fill: BRAND_COLOR.ink, radius: 0 };

const ICONS = [
  // Browsers draw an .ico's frames at 16, 32 and 48px: the snapped shapes are crisp at all three.
  ...[16, 32, 48].map((size) => ({ size, shapes: LOGO_SHAPES_SMALL, tile, ico: true })),
  { output: 'apple-touch-icon.png', size: 180, shapes: LOGO_SHAPES, tile: square },
  { output: 'icon-192.png', size: 192, shapes: LOGO_SHAPES, tile },
  { output: 'icon-512.png', size: 512, shapes: LOGO_SHAPES, tile },
  {
    output: 'icon-maskable-512.png',
    size: 512,
    shapes: LOGO_SHAPES,
    tile: square,
    scale: MASKABLE_SCALE,
  },
  // Shown at 24px in emails, so drawn for 2× screens.
  { output: 'email-logo.png', size: 48, shapes: LOGO_SHAPES_SMALL, tile },
];

/** An .ico file holding PNG frames, which every current browser reads. */
function icoFile(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length + 16 * frames.length;
  const entries = frames.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...frames.map(({ png }) => png)]);
}

const browser = await chromium.launch();

async function renderSvg(svg, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  return png;
}

writeFileSync(pub('favicon.svg'), faviconSvg());
console.log('apps/web/public/favicon.svg');

const frames = [];
for (const { output, size, shapes, tile: background, scale, ico } of ICONS) {
  const svg = logoSvg({ shapes, size, tile: background, fill: BRAND_COLOR.paper, scale });
  const png = await renderSvg(svg, size);
  if (ico) {
    frames.push({ size, png });
  } else {
    writeFileSync(pub(output), png);
    console.log(`apps/web/public/${output}`);
  }
}
writeFileSync(pub('favicon.ico'), icoFile(frames));
console.log('apps/web/public/favicon.ico');

// The link preview. Its logo is drawn here from the same shapes, into [data-logo].
const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await og.goto(pathToFileURL(join(web, 'design', 'og-image.html')).href);
await og.addStyleTag({ content: fontFace });
const logo = og.locator('[data-logo]');
const iconSize = Number(await logo.getAttribute('data-logo'));
await logo.evaluate(
  (element, svg) => {
    element.innerHTML = svg;
  },
  logoSvg({
    shapes: logoShapes(iconSize),
    size: iconSize,
    tile,
    fill: BRAND_COLOR.paper,
  }),
);
// Runs in the page, where `document` exists.
await og.waitForFunction(() => globalThis.document.fonts.status === 'loaded');
await og.screenshot({ path: pub('og-image.png') });
console.log('apps/web/public/og-image.png');

await browser.close();
