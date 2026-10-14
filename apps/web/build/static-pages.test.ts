import { describe, expect, it } from 'vitest';
import { publicPages } from '../src/app/public-pages.ts';
import {
  deferredEntry,
  pageFile,
  renderHome,
  renderPage,
  renderRobots,
  renderSitemap,
} from './static-pages.ts';

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

describe('renderHome', () => {
  const built = `<!doctype html><html><head>
<script>(function(){if(location.pathname.indexOf("/f/")===0)["/assets/form.js"].forEach(add);if(location.pathname==="/")["/assets/landing.js","/assets/icons.js"].forEach(add);})();</script>
<script type="module" crossorigin src="/assets/index-Ab12.js"></script>
<link rel="modulepreload" crossorigin href="/assets/react.js">
<link rel="stylesheet" crossorigin href="/assets/index.css">
</head><body><div id="root"></div></body></html>`;
  const html = renderHome(built, '<header>Formyx</header>');

  it('draws the page into its root, marked for the app to wait before drawing over it', () => {
    expect(html).toContain('<div id="root" data-prerendered><header>Formyx</header></div>');
  });

  it('asks for no script before the first paint, then for all of the home page’s', () => {
    expect(html).not.toContain('<script type="module"');
    expect(html).not.toContain('modulepreload" crossorigin');
    expect(html).not.toContain('location.pathname');
    expect(html).toContain('<link rel="stylesheet" crossorigin href="/assets/index.css">');
    const preloads = ['/assets/react.js', '/assets/landing.js', '/assets/icons.js'];
    expect(html).toContain(
      `<script>${deferredEntry('/assets/index-Ab12.js', preloads)}</script>\n</body>`,
    );
  });

  interface PaintList {
    getEntriesByName: (name: string) => unknown[];
  }

  /** Runs the loader with its timers, paints and fonts in the test's hands. */
  function loader({ paintTiming = true } = {}) {
    const frames: (() => void)[] = [];
    const timers: { callback: () => void; ms: number }[] = [];
    let paintObserved: (list: PaintList) => void = () => {};
    let fontsArrived = () => {};
    const appended: unknown[] = [];
    class Observer {
      constructor(callback: (list: PaintList) => void) {
        if (!paintTiming) throw new Error('No paint timing');
        paintObserved = callback;
      }
      observe() {}
    }
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- runs the script as a page would
    const run = new Function(
      'requestAnimationFrame',
      'setTimeout',
      'PerformanceObserver',
      'document',
      deferredEntry('/assets/index-Ab12.js', ['/assets/react.js']),
    ) as (...args: unknown[]) => void;
    run(
      (callback: () => void) => frames.push(callback),
      (callback: () => void, ms = 0) => timers.push({ callback, ms }),
      Observer,
      {
        createElement: () => ({}),
        head: { appendChild: (script: unknown) => appended.push(script) },
        fonts: {
          ready: {
            then: (callback: () => void) => {
              fontsArrived = callback;
            },
          },
        },
      },
    );
    const fire = (ms: number) => {
      for (const timer of timers.filter((candidate) => candidate.ms === ms)) timer.callback();
    };
    return {
      frames,
      fire,
      fontsArrived: () => {
        fontsArrived();
      },
      /** The browser reporting a paint by its name. */
      paint: (name: string) => {
        paintObserved({ getEntriesByName: (asked) => (asked === name ? [{}] : []) });
      },
      appended,
    };
  }

  it('starts the entry once the page has painted its content and its fonts have arrived', () => {
    const page = loader();
    // A frame, or a paint with nothing in it yet, is not enough.
    page.frames.shift()?.();
    page.fire(0);
    page.paint('first-paint');
    page.fontsArrived();
    expect(page.appended).toEqual([]);
    page.paint('first-contentful-paint');
    expect(page.appended).toEqual([]);
    page.fontsArrived();
    // The scripts it imports, asked for alongside it, then the entry itself.
    expect(page.appended).toEqual([
      { rel: 'modulepreload', crossOrigin: '', href: '/assets/react.js' },
      { type: 'module', crossOrigin: '', src: '/assets/index-Ab12.js' },
    ]);
    // Nothing starts it twice.
    page.fire(1000);
    page.fire(1500);
    expect(page.appended).toHaveLength(2);
  });

  it('waits a second at most for the fonts', () => {
    const page = loader();
    page.paint('first-contentful-paint');
    page.fire(1000);
    expect(page.appended).toHaveLength(2);
  });

  it('waits for a frame instead where the browser reports no paints', () => {
    const page = loader({ paintTiming: false });
    page.frames.shift()?.();
    page.fire(0);
    page.fontsArrived();
    expect(page.appended).toHaveLength(2);
  });

  it('starts anyway in a background tab, which paints nothing', () => {
    const page = loader();
    page.fire(1500);
    expect(page.appended).toHaveLength(2);
  });

  it('refuses an index.html it cannot fill', () => {
    expect(() => renderHome('<html><body></body></html>', 'x')).toThrow(/root/);
  });
});
