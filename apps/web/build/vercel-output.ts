import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import type { Plugin } from 'vite';

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
 * YouTube and Vimeo. `frameAncestors` decides who may embed the page.
 */
export function contentSecurityPolicy({
  scriptHashes,
  realtimeUrl,
  frameAncestors,
}: {
  scriptHashes: string[];
  realtimeUrl?: string | undefined;
  frameAncestors: string;
}): string {
  const connect = ["'self'", 'https://api.cloudinary.com'];
  if (realtimeUrl) {
    const realtime = originOf(realtimeUrl, 'VITE_REALTIME_URL');
    const socket = realtime.protocol === 'https:' ? 'wss:' : 'ws:';
    connect.push(realtime.origin, `${socket}//${realtime.host}`);
  }
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    // Voice notes: a respondent's own recording, and uploads played back in responses.
    "media-src 'self' blob: https://res.cloudinary.com",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    // Video blocks: the privacy-friendly YouTube and Vimeo players only.
    'frame-src https://www.youtube-nocookie.com https://player.vimeo.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join('; ');
}

const COMMON_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

/** Public forms may use the microphone, for voice-note questions; nothing else may. */
const FORM_PERMISSIONS = 'camera=(), microphone=(self), geolocation=(), payment=()';

/**
 * Routes for Vercel: `/api/*` proxied to the API, so the session cookie belongs to this site;
 * built files served as they are; every other path gets the app (client-side routing). Public
 * forms may be embedded anywhere; nothing else may be framed.
 */
export function vercelRoutes({ apiUrl, realtimeUrl, html }: DeployOptions): VercelRoute[] {
  const api = originOf(apiUrl, 'API_URL');
  const scriptHashes = inlineScriptHashes(html);
  const policy = (frameAncestors: string) =>
    contentSecurityPolicy({ scriptHashes, realtimeUrl, frameAncestors });

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
        'Content-Security-Policy': policy('*'),
      },
      continue: true,
    },
    {
      src: '^/(?!f/|api/).*$',
      headers: {
        ...COMMON_HEADERS,
        'Content-Security-Policy': policy("'none'"),
        'X-Frame-Options': 'DENY',
      },
      continue: true,
    },
    { src: '^/api/(.*)$', dest: `${api.origin}${api.pathname.replace(/\/$/, '')}/api/$1` },
    { handle: 'filesystem' },
    // A public form's page carries its own title and preview (see form-meta-edge.ts).
    { src: '^/f/[^/]+/?$', dest: `/${FORM_PAGE_FUNCTION}` },
    { src: '^/.*$', dest: '/index.html' },
  ];
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
