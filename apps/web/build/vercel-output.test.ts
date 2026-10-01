import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, inlineScriptHashes, vercelRoutes } from './vercel-output.ts';

const BOOT = "document.documentElement.dataset.theme='dark';";
const HTML = `<!doctype html><html><head>
<script>${BOOT}</script>
<script type="module" crossorigin src="/assets/index-Ab12.js"></script>
</head><body><div id="root"></div></body></html>`;

const sha = (script: string) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`;

describe('inlineScriptHashes', () => {
  it('hashes inline scripts and skips the ones loaded from a file', () => {
    expect(inlineScriptHashes(HTML)).toEqual([sha(BOOT)]);
  });
});

describe('contentSecurityPolicy', () => {
  it('allows the hashed scripts, uploads and the live-updates socket', () => {
    const policy = contentSecurityPolicy({
      scriptHashes: [sha(BOOT)],
      realtimeUrl: 'https://api.formyx.app',
      frameAncestors: "'none'",
    });

    expect(policy).toContain(`script-src 'self' ${sha(BOOT)}`);
    expect(policy).toContain(
      "connect-src 'self' https://api.cloudinary.com https://api.formyx.app wss://api.formyx.app",
    );
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain('unsafe-eval');
  });

  it('only connects to this site when the socket is served here too', () => {
    const policy = contentSecurityPolicy({ scriptHashes: [], frameAncestors: '*' });
    expect(policy).toContain("connect-src 'self' https://api.cloudinary.com;");
    expect(policy).toContain("script-src 'self';");
  });
});

describe('vercelRoutes', () => {
  const routes = vercelRoutes({
    apiUrl: 'https://formyx-api.onrender.com/',
    realtimeUrl: 'https://formyx-api.onrender.com',
    html: HTML,
  });

  /** The first route that ends routing for `path`, as Vercel would pick it. */
  function destination(path: string) {
    for (const route of routes) {
      if ('handle' in route) continue;
      if (!route.continue && new RegExp(route.src).test(path)) return route.dest;
    }
    return undefined;
  }

  function headersFor(path: string) {
    return Object.assign(
      {},
      ...routes.flatMap((route) =>
        'src' in route && route.continue && new RegExp(route.src).test(path) ? [route.headers] : [],
      ),
    ) as Record<string, string>;
  }

  it('proxies the API, so its session cookie belongs to this site', () => {
    const proxy = routes.find((route) => 'src' in route && route.src === '^/api/(.*)$');
    expect(proxy).toEqual({
      src: '^/api/(.*)$',
      dest: 'https://formyx-api.onrender.com/api/$1',
    });
  });

  it('serves built files first and the app for every other path', () => {
    const filesystem = routes.findIndex((route) => 'handle' in route);
    expect(filesystem).toBeGreaterThan(routes.findIndex((route) => 'dest' in route));
    expect(routes.at(-1)).toEqual({ src: '^/.*$', dest: '/index.html' });
    expect(destination('/app/forms/abc/edit')).toBe('/index.html');
  });

  it('lets anyone embed public forms but nothing else', () => {
    const form = headersFor('/f/customer-survey-x7k2?embed=1');
    expect(form['Content-Security-Policy']).toContain('frame-ancestors *');
    expect(form['X-Frame-Options']).toBeUndefined();

    for (const path of ['/', '/app/forms', '/login']) {
      const page = headersFor(path);
      expect(page['Content-Security-Policy']).toContain("frame-ancestors 'none'");
      expect(page['X-Frame-Options']).toBe('DENY');
      expect(page['X-Content-Type-Options']).toBe('nosniff');
    }
  });

  it('leaves API responses to the API’s own headers', () => {
    expect(headersFor('/api/auth/me')).toEqual({});
  });

  it('caches hashed assets for good and the embed script briefly', () => {
    expect(headersFor('/assets/index-Ab12.js')['Cache-Control']).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(headersFor('/embed.js')['Cache-Control']).toBe('public, max-age=300');
  });

  it('refuses an API address that is not a URL', () => {
    expect(() => vercelRoutes({ apiUrl: 'formyx-api', html: HTML })).toThrow(/API_URL/);
  });
});
