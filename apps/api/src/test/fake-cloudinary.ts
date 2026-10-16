import { randomUUID } from 'node:crypto';
import type { FileAnswer } from '@formyx/shared';
import { createCloudinaryStorage, signCloudinaryParams } from '../lib/upload-storage.js';

export const FAKE_CLOUD = 'formyx-test';
export const FAKE_API_KEY = 'test-api-key';
export const FAKE_API_SECRET = 'test-api-secret';
export const FAKE_APP_URL = 'https://app.formyx.test';
/** The fake's clock: Cloudinary's time, as the storage signs with it. */
const FAKE_NOW = 1_700_000_000_000;

interface FakeResource {
  resourceType: 'image' | 'raw';
  deliveryType: 'upload' | 'private';
  publicId: string;
  bytes: number;
  format: string | null;
  content: Uint8Array;
}

/** What a real file of this name starts with, so content checks pass unless a test says not. */
function believableContent(name: string): Uint8Array {
  const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';
  const text = (value: string) => new TextEncoder().encode(value);
  if (extension === 'pdf') return text('%PDF-1.7 fake');
  if (['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'key', 'zip'].includes(extension)) {
    return Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]);
  }
  if (['doc', 'xls', 'ppt'].includes(extension)) {
    return Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  return text('Plain text, as a test file holds.');
}

/**
 * The real Cloudinary storage, talking to an in-memory Cloudinary: `upload` stands in for a
 * browser uploading a file, and the Admin API and downloads answer from what was uploaded.
 */
export function createFakeCloudinary() {
  const resources = new Map<string, FakeResource>();
  const key = (deliveryType: string, publicId: string) => `${deliveryType}:${publicId}`;
  const notFound = () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 }),
    );

  const fakeFetch: typeof fetch = (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );

    // Renames, as the migration to private files does: same id, new delivery type.
    const rename = /^\/v1_1\/[^/]+\/(image|raw|video)\/rename$/.exec(url.pathname);
    if (rename && init?.body instanceof URLSearchParams) {
      const params = Object.fromEntries(init.body);
      const { api_key: _key, signature, ...signed } = params;
      if (signature !== signCloudinaryParams(signed, FAKE_API_SECRET)) {
        return Promise.resolve(new Response('Forbidden', { status: 401 }));
      }
      const from = resources.get(key(params.type ?? '', params.from_public_id ?? ''));
      if (!from || from.resourceType !== rename[1]) return notFound();
      resources.delete(key(from.deliveryType, from.publicId));
      const moved = { ...from, deliveryType: 'private' as const };
      resources.set(key('private', moved.publicId), moved);
      return Promise.resolve(Response.json({ public_id: moved.publicId, type: 'private' }));
    }

    // A file's content: its public delivery URL, or a signed private download link.
    if (url.hostname === 'res.cloudinary.com') {
      const path = url.pathname.split('/').slice(4).join('/');
      const resource =
        resources.get(key('upload', path)) ??
        resources.get(key('upload', path.replace(/\.[^./]+$/, '')));
      return resource ? Promise.resolve(new Response(resource.content)) : notFound();
    }
    const download = /^\/v1_1\/[^/]+\/(image|raw|video)\/download$/.exec(url.pathname);
    if (download) {
      const params = Object.fromEntries(url.searchParams);
      const { api_key: _key, signature, ...signed } = params;
      const valid =
        signature === signCloudinaryParams(signed, FAKE_API_SECRET) &&
        Number(params.expires_at) * 1000 > FAKE_NOW;
      const resource = resources.get(key('private', params.public_id ?? ''));
      if (!valid) return Promise.resolve(new Response('Forbidden', { status: 401 }));
      return resource ? Promise.resolve(new Response(resource.content)) : notFound();
    }

    const match = /^\/v1_1\/[^/]+\/resources\/(image|raw|video)\/(upload|private)\/(.+)$/.exec(
      url.pathname,
    );
    const resource = match?.[3]
      ? resources.get(key(match[2] ?? '', decodeURIComponent(match[3])))
      : undefined;
    if (!match || !resource || resource.resourceType !== match[1]) return notFound();
    return Promise.resolve(
      Response.json({
        public_id: resource.publicId,
        bytes: resource.bytes,
        ...(resource.format && { format: resource.format }),
        secure_url: deliveryUrl(resource),
      }),
    );
  };

  function deliveryUrl({ resourceType, deliveryType, publicId, format }: FakeResource): string {
    const suffix = resourceType === 'image' && format ? `.${format}` : '';
    // Private URLs carry a signature, as Cloudinary's do.
    const signature = deliveryType === 'private' ? 's--fakeSig1--/' : '';
    return `https://res.cloudinary.com/${FAKE_CLOUD}/${resourceType}/${deliveryType}/${signature}v1700000000/${publicId}${suffix}`;
  }

  return {
    /** Whether a file with this id is stored, and how. */
    deliveryOf(publicId: string): 'upload' | 'private' | null {
      if (resources.has(key('private', publicId))) return 'private';
      return resources.has(key('upload', publicId)) ? 'upload' : null;
    },

    storage: createCloudinaryStorage({
      cloudName: FAKE_CLOUD,
      apiKey: FAKE_API_KEY,
      apiSecret: FAKE_API_SECRET,
      appUrl: FAKE_APP_URL,
      fetch: fakeFetch,
      now: () => FAKE_NOW,
    }),

    /**
     * Stores a file as if a browser uploaded it into `folder` (privately, as respondents'
     * files are, with `private`); returns the answer it would send. `content` is what the
     * file holds, believable for its name unless given.
     */
    upload(
      folder: string,
      {
        name,
        bytes,
        format,
        content,
        private: isPrivate = false,
      }: { name: string; bytes: number; format?: string; content?: Uint8Array; private?: boolean },
    ): FileAnswer {
      const deliveryType = isPrivate ? 'private' : 'upload';
      // Cloudinary names images and keeps other files' extensions in their id.
      const resource: FakeResource = format
        ? {
            resourceType: 'image',
            deliveryType,
            publicId: `${folder}/${randomUUID()}`,
            bytes,
            format,
            content: content ?? new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          }
        : {
            resourceType: 'raw',
            deliveryType,
            publicId: `${folder}/${randomUUID()}_${name}`,
            bytes,
            format: null,
            content: content ?? believableContent(name),
          };
      resources.set(key(deliveryType, resource.publicId), resource);
      return {
        url: deliveryUrl(resource),
        publicId: resource.publicId,
        name,
        size: bytes,
        type: format ? `image/${format}` : 'application/octet-stream',
      };
    },
  };
}
