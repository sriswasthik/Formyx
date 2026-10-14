import { describe, expect, it } from 'vitest';
import { publicPages } from '../src/app/public-pages.ts';
import { pageFile, renderPage, renderRobots, renderSitemap } from './static-pages.ts';

const HTML = `<!doctype html><html><head>
<title>Formyx: forms people enjoy filling in</title>
<meta name="description" content="The site." />
<meta property="og:title" content="The site" />
</head><body><div id="root"></div></body></html>`;

const APP = 'https://formyx.app';

describe('renderPage', () => {
  const page = {
    path: '/templates/wedding-rsvp',
    title: 'Wedding RSVP template · Formyx',
    description: 'A free wedding RSVP form.',
    structuredData: { '@type': 'WebPage', name: '</script><script>alert(1)</script>' },
  };

  it('replaces the site’s title and description with the page’s own', () => {
    const html = renderPage(HTML, page, APP);
    expect(html).toContain('<title>Wedding RSVP template · Formyx</title>');
    expect(html).toContain('<meta name="description" content="A free wedding RSVP form." />');
    expect(html).toContain('<meta property="og:title" content="Wedding RSVP template · Formyx" />');
    expect(html).toContain(
      '<link rel="canonical" href="https://formyx.app/templates/wedding-rsvp" />',
    );
    expect(html).toContain('content="https://formyx.app/og-image.png"');
    expect(html).not.toContain('The site');
    expect(html).not.toContain('noindex');
  });

  it('writes structured data that cannot close its script element', () => {
    const html = renderPage(HTML, page, APP);
    const json = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)?.[1] ?? '';
    expect(json).not.toContain('</script>');
    expect(JSON.parse(json)).toEqual(page.structuredData);
  });
});

describe('renderSitemap and renderRobots', () => {
  it('lists the homepage and every page, absolutely', () => {
    const sitemap = renderSitemap([{ path: '/pricing', title: 'Pricing', description: '' }], APP);
    expect(sitemap).toContain('<loc>https://formyx.app/</loc>');
    expect(sitemap).toContain('<loc>https://formyx.app/pricing</loc>');
  });

  it('points robots at the sitemap', () => {
    const robots = renderRobots('User-agent: *\nAllow: /\n', APP);
    expect(robots).toBe(
      'User-agent: *\nAllow: /\nDisallow: /pages/\n\nSitemap: https://formyx.app/sitemap.xml\n',
    );
  });
});

describe('publicPages', () => {
  it('has a page for every template, each with a unique, safe path and a description', () => {
    const pages = publicPages();
    expect(pages.filter((page) => page.path.startsWith('/templates/')).length).toBeGreaterThan(30);
    expect(new Set(pages.map((page) => page.path)).size).toBe(pages.length);
    for (const page of pages) {
      expect(page.path).toMatch(/^(\/[a-z0-9-]+)+$/);
      expect(page.description.length).toBeGreaterThan(0);
      expect(page.description.length).toBeLessThanOrEqual(160);
      expect(pageFile(page.path)).toBe(`pages${page.path}.html`);
    }
  });
});
