import type { FormMeta } from '@formyx/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFormMetaHandler, injectFormMeta } from './form-meta-edge.ts';
import { formPageFunction } from './vercel-output.ts';

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Formyx: forms people enjoy filling in</title>
    <meta
      name="description"
      content="Formyx is a form builder."
    />
    <meta name="theme-color" content="#ffffff" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <!-- Link previews. %APP_URL% is the site's address (VITE_APP_URL), filled in at build. -->
    <meta property="og:title" content="Formyx" />
    <meta property="og:image" content="https://formyx.app/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script>boot()</script>
  </head>
  <body><div id="root"></div></body>
</html>`;

const META: FormMeta = {
  slug: 'rsvp-x7k2',
  title: 'Party "RSVP" <2026>',
  description: 'Tell us if you can come & what you will bring.',
  imageUrl: 'https://formyx.app/api/public/forms/rsvp-x7k2/og.png?v=1',
  indexable: false,
};

const PAGE = 'https://formyx.app/f/rsvp-x7k2';

describe('injectFormMeta', () => {
  const html = injectFormMeta(HTML, META, PAGE);

  it("replaces the site's title, description and preview with the form's, escaped", () => {
    expect(html).toContain('<title>Party &quot;RSVP&quot; &lt;2026&gt;</title>');
    expect(html).toContain(
      '<meta property="og:title" content="Party &quot;RSVP&quot; &lt;2026&gt;" />',
    );
    expect(html).toContain(
      '<meta name="description" content="Tell us if you can come &amp; what you will bring." />',
    );
    expect(html).toContain(`<meta property="og:image" content="${META.imageUrl}" />`);
    expect(html).toContain(`<meta property="og:url" content="${PAGE}" />`);
    expect(html).toContain(`<link rel="canonical" href="${PAGE}" />`);
    expect(html).not.toContain('Formyx is a form builder');
    expect(html).not.toContain('og-image.png');
    expect(html.match(/og:title/g)).toHaveLength(1);
  });

  it('keeps everything else, including the boot script and theme colour', () => {
    expect(html).toContain('<script>boot()</script>');
    expect(html).toContain('<meta name="theme-color" content="#ffffff" />');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  });

  it('keeps unlisted forms out of search engines, and lets listed ones in', () => {
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(injectFormMeta(HTML, { ...META, indexable: true }, PAGE)).not.toContain('robots');
  });

  it("uses the form's icon when it has one", () => {
    const withIcon = injectFormMeta(
      HTML,
      { ...META, faviconUrl: 'https://res.cloudinary.com/x/icon.png' },
      PAGE,
    );
    expect(withIcon).toContain('<link rel="icon" href="https://res.cloudinary.com/x/icon.png" />');
    expect(withIcon).not.toContain('/favicon.svg');
  });

  it('leaves the description out when the form has none', () => {
    const { description: _none, ...plain } = META;
    expect(injectFormMeta(HTML, plain, PAGE)).not.toContain('description');
  });
});

describe('createFormMetaHandler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const handler = createFormMetaHandler({ apiUrl: 'https://api.formyx.app/', html: HTML });

  it("serves the form's page with its details from the API", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(META)));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(new Request('https://formyx.app/f/rsvp-x7k2?embed=1'));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.formyx.app/api/public/forms/rsvp-x7k2/meta',
      expect.anything(),
    );
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toContain('<title>Party &quot;RSVP&quot; &lt;2026&gt;</title>');
  });

  it('sends an old address on to the current one, keeping the query', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json(META)));

    const response = await handler(new Request('https://formyx.app/f/old-name?ref=mail'));

    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('https://formyx.app/f/rsvp-x7k2?ref=mail');
  });

  it('serves the page as it is when the form is unknown or the API fails', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 404 })));
    expect(await (await handler(new Request('https://formyx.app/f/nope'))).text()).toBe(HTML);

    vi.stubGlobal('fetch', () => Promise.reject(new Error('down')));
    expect(await (await handler(new Request('https://formyx.app/f/nope'))).text()).toBe(HTML);
  });
});

describe('formPageFunction', () => {
  it('is plain JavaScript with no imports, its handler set up for this deploy', () => {
    const code = formPageFunction({ apiUrl: 'https://api.formyx.app', html: HTML });
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toContain(': string');
    expect(code).toContain(
      'export default createFormMetaHandler({"apiUrl":"https://api.formyx.app/"',
    );
  });
});
