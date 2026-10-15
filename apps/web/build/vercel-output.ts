import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import ts from 'typescript';
import type { Plugin } from 'vite';
import { HOME_FILE, PAGES_DIR } from './static-pages.ts';

/** One entry of a Vercel Build Output API (v3) `config.json` routes list. */
export type VercelRoute =
  | { handle: 'filesystem' }
  | { src: string; dest?: string; headers?: Record<string, string>; continue?: boolean };

interface DeployOptions {
  /** Where the API runs, e.g. `https://formyx-api.onrender.com`. `/api/*` is proxied there. */
  apiUrl: string;
  /** Where the browser opens the live-updates socket, when it is not this site. */
  realtimeUrl?: string | undefined;
  /** The built index.html, whose inline scripts the content security policy allows by hash. */
  html: string;
  /** Paths with their own page (see build/static-pages.ts), e.g. `/templates/wedding-rsvp`. */
  pages?: readonly string[];
  /**
   * The home page's own copy (see build/static-pages.ts), served at `/`: its inline scripts are
   * allowed by hash too.
   */
  homeHtml?: string | undefined;
}

/** `sha256-…` sources for each inline `<script>` in `html`, for `script-src`. */
export function inlineScriptHashes(html: string): string[] {
  const inline = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  return [...html.matchAll(inline)]
    .map((match) => match[1] ?? '')
    .filter((script) => script.trim() !== '')
    .map((script) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`);
}

function originOf(url: string, name: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new Error(`${name} must be a full URL such as https://formyx-api.onrender.com`);
  }
}

/**
 * The content security policy. Scripts only from this site (plus the hashed inline ones); styles
 * allow inline `style` attributes, which animations set; images may come from any https host,
 * because form logos and covers are links people paste; audio from uploads; video players from
 * YouTube and Vimeo. `frameAncestors` decides who may embed the page. With `payments` (the
 * app's own pages, never public forms), Razorpay Checkout's script, window and API too. With
 * `captcha` (public forms), Cloudflare Turnstile's, for forms that switch the spam check on.
 */
export function contentSecurityPolicy({
  scriptHashes,
  realtimeUrl,
  frameAncestors,
  payments = false,
  captcha = false,
}: {
  scriptHashes: string[];
  realtimeUrl?: string | undefined;
  frameAncestors: string;
  payments?: boolean;
  captcha?: boolean;
}): string {
  const connect = ["'self'", 'https://api.cloudinary.com'];
  if (payments) connect.push(...RAZORPAY.connect);
  if (captcha) connect.push(TURNSTILE);
  if (realtimeUrl) {
    const realtime = originOf(realtimeUrl, 'VITE_REALTIME_URL');
    const socket = realtime.protocol === 'https:' ? 'wss:' : 'ws:';
    connect.push(realtime.origin, `${socket}//${realtime.host}`);
  }
  return [
    "default-src 'self'",
    [
      'script-src',
      "'self'",
      ...scriptHashes,
      ...(payments ? RAZORPAY.script : []),
      ...(captcha ? [TURNSTILE] : []),
    ].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    // Voice notes: a respondent's own recording, and uploads played back in responses.
    "media-src 'self' blob: https://res.cloudinary.com",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    // Video blocks: the privacy-friendly YouTube and Vimeo players only.
    [
      'frame-src',
      'https://www.youtube-nocookie.com',
      'https://player.vimeo.com',
      ...(payments ? RAZORPAY.frame : []),
      ...(captcha ? [TURNSTILE] : []),
    ].join(' '),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join('; ');
}

/** Cloudflare Turnstile's script, widget and checks all come from here. */
const TURNSTILE = 'https://challenges.cloudflare.com';

/** What Razorpay Checkout loads, as Razorpay documents it. */
const RAZORPAY = {
  script: ['https://checkout.razorpay.com'],
  frame: ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
  connect: ['https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
};

const COMMON_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

/** The app's pages: payments through Razorpay's window, nothing else. */
const APP_PERMISSIONS =
  'camera=(), microphone=(), geolocation=(), payment=(self "https://api.razorpay.com")';

/** Public forms may use the microphone, for voice-note questions; nothing else may. */
const FORM_PERMISSIONS = 'camera=(), microphone=(self), geolocation=(), payment=()';

/**
 * Routes for Vercel: `/api/*` proxied to the API, so the session cookie belongs to this site;
 * built files served as they are; every other path gets the app (client-side routing). Public
 * forms may be embedded anywhere; nothing else may be framed.
 */
export function vercelRoutes({
  apiUrl,
  realtimeUrl,
  html,
  pages = [],
  homeHtml,
}: DeployOptions): VercelRoute[] {
  const api = originOf(apiUrl, 'API_URL');
  const scriptHashes = [
    ...new Set([...inlineScriptHashes(html), ...(homeHtml ? inlineScriptHashes(homeHtml) : [])]),
  ];
  const policy = (frameAncestors: string, payments = false, captcha = false) =>
    contentSecurityPolicy({ scriptHashes, realtimeUrl, frameAncestors, payments, captcha });

  return [
    {
      src: '^/assets/(.*)$',
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    // Host pages load it by a fixed name, so it may change under them: keep caches short.
    { src: '^/embed\\.js$', headers: { 'Cache-Control': 'public, max-age=300' }, continue: true },
    {
      src: '^/f/.*$',
      headers: {
        ...COMMON_HEADERS,
        'Permissions-Policy': FORM_PERMISSIONS,
        'Content-Security-Policy': policy('*', false, true),
      },
      continue: true,
    },
    {
      src: '^/(?!f/|api/).*$',
      headers: {
        ...COMMON_HEADERS,
        'Content-Security-Policy': policy("'none'", true),
        // Razorpay Checkout may offer the browser's own payment sheet.
        'Permissions-Policy': APP_PERMISSIONS,
        'X-Frame-Options': 'DENY',
      },
      continue: true,
    },
    { src: '^/api/(.*)$', dest: `${api.origin}${api.pathname.replace(/\/$/, '')}/api/$1` },
    // Before the files, where `/` would be index.html: the home page with its top drawn in.
    ...(homeHtml ? [{ src: '^/$', dest: `/${HOME_FILE}` }] : []),
    { handle: 'filesystem' },
    ...pageRoutes(pages),
    // A public form's page carries its own title and preview (see form-meta-edge.ts).
    { src: '^/f/[^/]+/?$', dest: `/${FORM_PAGE_FUNCTION}` },
    { src: '^/.*$', dest: '/index.html' },
  ];
}

/** Public pages with their own title and description in the <head>, served from their files. */
export function pageRoutes(pages: readonly string[]): VercelRoute[] {
  const paths = pages.map((path) => path.replace(/^\//, ''));
  if (paths.length === 0) return [];
  for (const path of paths) {
    if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(path)) throw new Error(`Unsafe page path: /${path}`);
  }
  return [{ src: `^/(${paths.join('|')})/?$`, dest: `/${PAGES_DIR}/$1.html` }];
}

/** The paths of the pages build/static-pages.ts wrote under `outDir`. */
export function builtPages(outDir: string): string[] {
  const dir = join(outDir, PAGES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.html'))
    .map(
      (file) =>
        `/${file
          .split(sep)
          .join('/')
          .replace(/\.html$/, '')}`,
    )
    .sort();
}

/** The edge function that writes a form's details into its page. */
export const FORM_PAGE_FUNCTION = 'form-page';

/**
 * The edge function's code: form-meta-edge.ts as JavaScript, with its handler set up for this
 * deploy (the API's address and the built page).
 */
export function formPageFunction({ apiUrl, html }: { apiUrl: string; html: string }): string {
  const source = readFileSync(join(import.meta.dirname, 'form-meta-edge.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const options = JSON.stringify({ apiUrl: originOf(apiUrl, 'API_URL').href, html });
  return `${outputText}\nexport default createFormMetaHandler(${options});\n`;
}

/**
 * On Vercel (which sets VERCEL=1 while building), writes the build as Build Output API files:
 * `.vercel/output/static` and a `config.json` whose routes come from `vercelRoutes`. Doing it
 * at build time lets the API's address come from the API_URL environment variable.
 */
export function vercelOutput(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';

  return {
    name: 'formyx:vercel-output',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (process.env.VERCEL !== '1') return;

      const apiUrl = process.env.API_URL;
      if (!apiUrl) {
        throw new Error('Set API_URL to the API’s address, e.g. https://formyx-api.onrender.com');
      }
      const realtimeUrl = process.env.VITE_REALTIME_URL || undefined;
      if (!realtimeUrl) {
        this.warn(
          'VITE_REALTIME_URL is not set: Vercel cannot proxy WebSockets, so live updates will ' +
            'fall back to polling. Set it to the API’s address.',
        );
      }

      const output = join(root, '.vercel', 'output');
      rmSync(output, { recursive: true, force: true });
      mkdirSync(output, { recursive: true });
      cpSync(outDir, join(output, 'static'), { recursive: true });
      const routes = vercelRoutes({
        apiUrl,
        realtimeUrl,
        html: readFileSync(join(outDir, 'index.html'), 'utf8'),
        pages: builtPages(outDir),
        homeHtml: existsSync(join(outDir, HOME_FILE))
          ? readFileSync(join(outDir, HOME_FILE), 'utf8')
          : undefined,
      });
      writeFileSync(
        join(output, 'config.json'),
        `${JSON.stringify({ version: 3, routes }, null, 2)}\n`,
      );
      const formPage = join(output, 'functions', `${FORM_PAGE_FUNCTION}.func`);
      mkdirSync(formPage, { recursive: true });
      writeFileSync(
        join(formPage, 'index.js'),
        formPageFunction({ apiUrl, html: readFileSync(join(outDir, 'index.html'), 'utf8') }),
      );
      writeFileSync(
        join(formPage, '.vc-config.json'),
        `${JSON.stringify({ runtime: 'edge', entrypoint: 'index.js' }, null, 2)}\n`,
      );
    },
  };
}
