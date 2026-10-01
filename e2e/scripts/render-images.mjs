/* eslint-disable no-console -- a command-line tool: it prints what it wrote. */
// Renders the web app's static images from their HTML sources in apps/web/design:
// public/og-image.png (link previews) and public/apple-touch-icon.png.
// Usage: pnpm --filter @formyx/e2e render:images
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const web = join(import.meta.dirname, '..', '..', 'apps', 'web');
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

const IMAGES = [
  { source: 'og-image.html', output: 'og-image.png', width: 1200, height: 630 },
  { source: 'apple-touch-icon.html', output: 'apple-touch-icon.png', width: 180, height: 180 },
];

const browser = await chromium.launch();
for (const { source, output, width, height } of IMAGES) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(web, 'design', source)).href);
  await page.addStyleTag({ content: fontFace });
  // Runs in the page, where `document` exists.
  await page.waitForFunction(() => globalThis.document.fonts.status === 'loaded');
  await page.screenshot({ path: join(web, 'public', output) });
  await page.close();
  console.log(`apps/web/public/${output}`);
}
await browser.close();
