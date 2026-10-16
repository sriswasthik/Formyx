/* eslint-disable no-console -- a command-line server: printing is how it reports. */
// A stand-in for the outside services the API calls, for end-to-end tests: Cloudinary's
// upload, resource and private download APIs (the API's CLOUDINARY_API_URL points here) and India Post's PIN
// code look-up (PINCODE_API_URL), Google's sign-in and Sheets API (fake-google.mjs), and
// Razorpay's API and Checkout (fake-razorpay.mjs). Files are kept in memory; their delivery URLs say
// res.cloudinary.com, as real ones do, and tests route those to /delivery/ here.
// Usage: node scripts/fake-cloudinary.mjs [port]
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { handleGoogle } from './fake-google.mjs';
import { handleRazorpay } from './fake-razorpay.mjs';

const PORT = Number(process.argv[2] ?? process.env.FAKE_CLOUDINARY_PORT ?? 4590);

/** By public id: what Cloudinary would report, and the bytes. */
const files = new Map();

/** PIN codes the look-up knows, as India Post would answer. */
const PIN_CODES = {
  560001: { District: 'Bengaluru', State: 'Karnataka' },
  110001: { District: 'New Delhi', State: 'Delhi' },
};

function resourceType(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return 'video';
  return 'raw';
}

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json',
    ...headers,
  });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function upload(req, res, cloud) {
  const body = await readBody(req);
  const form = await new Request('http://fake/upload', {
    method: 'POST',
    headers: { 'content-type': req.headers['content-type'] ?? '' },
    body,
  }).formData();
  const file = form.get('file');
  const folder = String(form.get('folder') ?? '');
  if (!(file instanceof Blob) || !folder || !form.get('signature')) {
    send(res, 400, { error: { message: 'Missing file, folder or signature' } });
    return;
  }
  const name = 'name' in file ? String(file.name) : 'file';
  const extension = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? 'bin').toLowerCase();
  const allowed = String(form.get('allowed_formats') ?? '')
    .split(',')
    .filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(extension)) {
    send(res, 400, { error: { message: `Invalid file format ${extension}` } });
    return;
  }
  // Audio and video files are typed by their extension (Chromium records audio/webm).
  const type = resourceType(file.type || `application/${extension}`);
  const id = `${folder}/${randomBytes(6).toString('hex')}`;
  const publicId = type === 'raw' ? `${id}.${extension}` : id;
  const path = type === 'raw' ? publicId : `${publicId}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  // Respondents' files are private: reachable only through signed download links.
  const delivery = form.get('type') === 'private' ? 'private' : 'upload';
  const signed = delivery === 'private' ? 's--fake1234--/' : '';
  const resource = {
    public_id: publicId,
    bytes: bytes.length,
    ...(type !== 'raw' && { format: extension }),
    resource_type: type,
    type: delivery,
    secure_url: `https://res.cloudinary.com/${cloud}/${type}/${delivery}/${signed}v1/${path}`,
  };
  files.set(publicId, { resource, bytes, mime: file.type || 'application/octet-stream' });
  send(res, 200, resource);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (parts[0] === 'health') return send(res, 200, { ok: true });

  // POST /v1_1/<cloud>/auto/upload
  if (req.method === 'POST' && parts[0] === 'v1_1' && parts[3] === 'upload') {
    upload(req, res, parts[1]).catch((error) => {
      console.error(error);
      send(res, 500, { error: { message: 'Upload failed' } });
    });
    return;
  }

  // GET /v1_1/<cloud>/resources/<type>/<upload|private>/<public id>
  if (req.method === 'GET' && parts[0] === 'v1_1' && parts[2] === 'resources') {
    const stored = files.get(parts.slice(5).join('/'));
    return stored && stored.resource.type === parts[4]
      ? send(res, 200, stored.resource)
      : send(res, 404, { error: 'Not found' });
  }

  // GET /v1_1/<cloud>/<type>/download?public_id=…: a private file, by a signed link. The
  // fake trusts the signature; it only checks the link has one and has not run out.
  if (req.method === 'GET' && parts[0] === 'v1_1' && parts[3] === 'download') {
    const stored = files.get(url.searchParams.get('public_id') ?? '');
    const expiresAt = Number(url.searchParams.get('expires_at'));
    if (!url.searchParams.get('signature') || !(expiresAt * 1000 > Date.now())) {
      return send(res, 401, 'Link expired', { 'Content-Type': 'text/plain' });
    }
    if (!stored) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    return send(res, 200, stored.bytes, { 'Content-Type': stored.mime });
  }

  // GET /delivery/<cloud>/<type>/upload/v1/<path>: what res.cloudinary.com would serve.
  if (req.method === 'GET' && parts[0] === 'delivery') {
    const path = parts.slice(5).join('/');
    const stored = files.get(path) ?? files.get(path.replace(/\.[^./]+$/, '')) ?? null;
    if (!stored) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    return send(res, 200, stored.bytes, { 'Content-Type': stored.mime });
  }

  // /google/…: Google's sign-in, tokens and Sheets (see fake-google.mjs).
  if (parts[0] === 'google') {
    handleGoogle(req, res, url, parts.slice(1), send, readBody).catch((error) => {
      console.error(error);
      send(res, 500, { error: { message: String(error) } });
    });
    return;
  }

  // /razorpay/…: Razorpay's API and Checkout (see fake-razorpay.mjs).
  if (parts[0] === 'razorpay') {
    handleRazorpay(req, res, url, parts.slice(1), send, readBody).catch((error) => {
      console.error(error);
      send(res, 500, { error: { message: String(error) } });
    });
    return;
  }

  // GET /pincode/<pin>: India Post's look-up.
  if (req.method === 'GET' && parts[0] === 'pincode') {
    const office = PIN_CODES[parts[1]];
    return send(
      res,
      200,
      office
        ? [{ Status: 'Success', PostOffice: [{ Name: 'Head Office', ...office }] }]
        : [{ Status: 'Error', PostOffice: null }],
    );
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Fake Cloudinary, India Post, Google and Razorpay on http://localhost:${PORT}`);
});
