/// <reference lib="dom" />
import { FIELD_TYPES, RATING_STYLES } from '@formyx/shared';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CHUNK_BY_TYPE,
  controlChunk,
  CONTROL_MODULES,
  RATING_ICONS_CHUNK,
} from '../src/features/form-renderer/controls/control-chunks.ts';
import { formAssetScript, themeFontFiles, type FormAssets } from './form-asset-preload.ts';
import { runInlineScript } from './test-utils.ts';

const asset = (fileName: string, original: string) => ({
  type: 'asset' as const,
  fileName,
  originalFileNames: [`../../node_modules/.pnpm/x/node_modules/${original}`],
});

describe('themeFontFiles', () => {
  it("finds each font's stylesheets and Latin files, by weight", () => {
    const fonts = themeFontFiles([
      asset('assets/source-serif-4-A.css', '@fontsource-variable/source-serif-4/index.css'),
      asset(
        'assets/source-serif-4-latin-wght-normal-B.woff2',
        '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2',
      ),
      // Other alphabets load only when a form uses them (their unicode-range).
      asset(
        'assets/source-serif-4-latin-ext-wght-normal-C.woff2',
        '@fontsource-variable/source-serif-4/files/source-serif-4-latin-ext-wght-normal.woff2',
      ),
      asset('assets/700-D.css', '@fontsource/kalam/700.css'),
      asset('assets/300-E.css', '@fontsource/kalam/300.css'),
      asset(
        'assets/kalam-latin-700-normal-F.woff2',
        '@fontsource/kalam/files/kalam-latin-700-normal.woff2',
      ),
      asset(
        'assets/kalam-latin-300-normal-G.woff2',
        '@fontsource/kalam/files/kalam-latin-300-normal.woff2',
      ),
      asset(
        'assets/kalam-latin-300-normal-H.woff',
        '@fontsource/kalam/files/kalam-latin-300-normal.woff',
      ),
      // A font for another alphabet, loaded with its language rather than a theme.
      asset(
        'assets/noto-sans-telugu-latin-wght-normal-J.woff2',
        '@fontsource-variable/noto-sans-telugu/files/noto-sans-telugu-latin-wght-normal.woff2',
      ),
      // Inter's stylesheet is part of the app's.
      asset(
        'assets/inter-latin-wght-normal-I.woff2',
        '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
      ),
    ]);

    expect(fonts).toEqual({
      'source-serif-4': [
        ['assets/source-serif-4-A.css'],
        [[0, 'assets/source-serif-4-latin-wght-normal-B.woff2']],
      ],
      kalam: [
        ['assets/300-E.css', 'assets/700-D.css'],
        [
          [300, 'assets/kalam-latin-300-normal-G.woff2'],
          [700, 'assets/kalam-latin-700-normal-F.woff2'],
        ],
      ],
      inter: [[], [[0, 'assets/inter-latin-wght-normal-I.woff2']]],
    });
  });
});

/** index.html's early request for the form (declared for the app in vite-env.d.ts). */
const page = window as Window & {
  __formyxPrefetch?: { slug: string; response: Promise<Response> };
};

describe('formAssetScript', () => {
  const assets: FormAssets = {
    base: '/assets/',
    fonts: {
      inter: [[], [[0, 'inter-latin.woff2']]],
      'source-serif-4': [['serif.css'], [[0, 'serif-latin.woff2']]],
      kalam: [
        ['kalam-300.css', 'kalam-700.css'],
        [
          [300, 'kalam-300.woff2'],
          [700, 'kalam-700.woff2'],
        ],
      ],
    },
    fontLoaders: 'font-loaders.js',
    controls: Object.fromEntries(
      Object.keys(CONTROL_MODULES).map((id) => [id, [`${id}.js`, 'shared.js']]),
    ),
    chunkByType: CHUNK_BY_TYPE,
    ratingIcons: RATING_ICONS_CHUNK,
    conversational: ['conversational.js'],
  };

  afterEach(() => {
    document.head.innerHTML = '';
    delete page.__formyxPrefetch;
  });

  async function run(body: unknown, ok = true) {
    page.__formyxPrefetch = {
      slug: 'a-form',
      response: Promise.resolve(new Response(JSON.stringify(body), { status: ok ? 200 : 404 })),
    };
    runInlineScript(formAssetScript(assets));
    // Let the response's promises settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return [...document.head.querySelectorAll('link')].map((link) =>
      [link.rel, link.getAttribute('href'), link.getAttribute('as') ?? ''].join(' ').trimEnd(),
    );
  }

  const theme = (typography: object, layout = 'classic') => ({
    typography,
    layout: { mode: layout },
  });

  it("preloads the theme's fonts in the weights the form waits for", async () => {
    const links = await run({
      status: 'open',
      theme: theme({ headingFont: 'kalam', headingWeight: 600, bodyFont: 'source-serif-4' }),
      schema: { fields: [] },
    });
    expect(links).toEqual([
      'preload /assets/kalam-300.css style',
      'preload /assets/kalam-700.css style',
      'preload /assets/kalam-700.woff2 font',
      'preload /assets/serif.css style',
      'preload /assets/serif-latin.woff2 font',
      'modulepreload /assets/font-loaders.js',
    ]);
  });

  it('preloads Inter only when the theme uses it, without the font loaders', async () => {
    expect(
      await run({ theme: theme({ headingFont: 'inter', headingWeight: 600, bodyFont: 'inter' }) }),
    ).toEqual(['preload /assets/inter-latin.woff2 font']);
  });

  it('asks for a file once, however many things need it', async () => {
    const links = await run({
      theme: theme({
        headingFont: 'source-serif-4',
        headingWeight: 700,
        bodyFont: 'source-serif-4',
      }),
      schema: { fields: [{ type: 'phone' }, { type: 'url' }, { type: 'slider' }] },
    });
    expect(links).toEqual([
      'preload /assets/serif.css style',
      'preload /assets/serif-latin.woff2 font',
      'modulepreload /assets/font-loaders.js',
      'modulepreload /assets/inputs.js',
      'modulepreload /assets/shared.js',
      'modulepreload /assets/slider.js',
    ]);
  });

  it('preloads the conversational layout for a form shown a question at a time', async () => {
    const links = await run({
      theme: theme({ headingFont: 'gone', headingWeight: 600, bodyFont: 'gone' }, 'conversational'),
      schema: { fields: [{ type: 'short_text' }] },
    });
    expect(links).toEqual(['modulepreload /assets/conversational.js']);
  });

  it('chooses the chunk each question type draws with, as the renderer does', async () => {
    for (const type of FIELD_TYPES) {
      for (const ratingStyle of type === 'rating' ? RATING_STYLES : [undefined]) {
        const field = { type, ratingStyle };
        const links = await run({
          theme: theme({ headingFont: 'gone', headingWeight: 600, bodyFont: 'gone' }),
          schema: { fields: [field] },
        });
        const chunk = controlChunk(field);
        expect(links, `${type} ${ratingStyle ?? ''}`).toEqual(
          chunk ? [`modulepreload /assets/${chunk}.js`, 'modulepreload /assets/shared.js'] : [],
        );
        document.head.innerHTML = '';
      }
    }
  });

  it('preloads nothing for a missing form', async () => {
    expect(await run({ error: { code: 'NOT_FOUND' } }, false)).toEqual([]);
  });

  it('leaves the response for the app to read', async () => {
    const body = { theme: theme({ headingFont: 'kalam', headingWeight: 400, bodyFont: 'kalam' }) };
    await run(body);
    const response = await page.__formyxPrefetch?.response;
    expect(await response?.json()).toEqual(body);
  });
});
