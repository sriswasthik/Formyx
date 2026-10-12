/* eslint-disable no-console -- a command-line server: printing is how it reports. */
// Serves the web app's production build the way Vercel does for the performance tests:
// HTTP/2 over TLS, Brotli-compressed, every unknown path answered with index.html, and /api
// passed on to the API. `vite preview` speaks HTTP/1.1, where a browser opens at most six
// connections to a host: on a slow connection the form's few dozen small files then queue,
// which respondents on HTTP/2 never see.
//
// Usage: node perf/serve-h2.mjs <port> <dist dir> <api origin>

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createSecureServer } from 'node:http2';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

const [port = '4174', distArg = '../apps/web/dist', api = 'http://localhost:4104'] =
  process.argv.slice(2);
const dist = resolve(distArg);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml']);

// Hop-by-hop headers, which HTTP/2 forbids.
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'host',
]);

/** A self-signed certificate for localhost, made once per machine. */
function certificate() {
  const dir = join(tmpdir(), 'formyx-perf-cert');
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  if (!existsSync(key) || !existsSync(cert)) {
    mkdirSync(dir, { recursive: true });
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        key,
        '-out',
        cert,
        '-days',
        '365',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
      ],
      { stdio: 'ignore' },
    );
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

/** Every file in the build, compressed ahead of time as Vercel does. */
async function loadBuild() {
  const files = new Map();
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      const body = await readFile(path);
      const ext = extname(entry.name);
      const brotli = COMPRESSIBLE.has(ext)
        ? brotliCompressSync(body, {
            params: {
              [constants.BROTLI_PARAM_QUALITY]: 11,
              [constants.BROTLI_PARAM_SIZE_HINT]: body.length,
            },
          })
        : null;
      const url = `/${path
        .slice(dist.length + 1)
        .split(sep)
        .join('/')}`;
      files.set(url, { body, brotli, type: TYPES[ext] ?? 'application/octet-stream' });
    }
  };
  await walk(dist);
  return files;
}

function proxy(req, res) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!name.startsWith(':') && !HOP_BY_HOP.has(name)) headers[name] = value;
  }
  headers.host = new URL(api).host;
  const upstream = request(new URL(req.url, api), { method: req.method, headers }, (answer) => {
    const out = {};
    for (const [name, value] of Object.entries(answer.headers)) {
      if (!HOP_BY_HOP.has(name) && value !== undefined) out[name] = value;
    }
    res.writeHead(answer.statusCode ?? 502, out);
    answer.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
}

const files = await loadBuild();
const index = files.get('/index.html');
if (!index) throw new Error(`No index.html in ${dist}: build the web app first`);

createSecureServer({ ...certificate(), allowHTTP1: true }, (req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
  if (path === '/api' || path.startsWith('/api/')) {
    proxy(req, res);
    return;
  }
  const file = files.get(path) ?? (path.startsWith('/assets/') ? undefined : index);
  if (!file) {
    res.writeHead(404);
    res.end();
    return;
  }
  const brotli = file.brotli && /\bbr\b/.test(String(req.headers['accept-encoding'] ?? ''));
  res.writeHead(200, {
    'content-type': file.type,
    'cache-control': path.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate',
    vary: 'accept-encoding',
    ...(brotli ? { 'content-encoding': 'br' } : {}),
  });
  res.end(brotli ? file.brotli : file.body);
}).listen(Number(port), () => {
  console.log(`Serving ${dist} over HTTP/2 on https://localhost:${port}, /api from ${api}`);
});
