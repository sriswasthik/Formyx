import { randomUUID } from 'node:crypto';
import type { FileAnswer } from '@formyx/shared';
import { createCloudinaryStorage } from '../lib/upload-storage.js';

export const FAKE_CLOUD = 'formyx-test';
export const FAKE_API_KEY = 'test-api-key';
export const FAKE_API_SECRET = 'test-api-secret';

interface FakeResource {
  resourceType: 'image' | 'raw';
  publicId: string;
  bytes: number;
  format: string | null;
}

/**
 * The real Cloudinary storage, talking to an in-memory Cloudinary: `upload` stands in for a
 * browser uploading a file, and the Admin API answers from what was uploaded.
 */
export function createFakeCloudinary() {
  const resources = new Map<string, FakeResource>();

  const fakeFetch: typeof fetch = (input) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const match = /^\/v1_1\/[^/]+\/resources\/(image|raw|video)\/upload\/(.+)$/.exec(url.pathname);
    const publicId = match?.[2] ? decodeURIComponent(match[2]) : '';
    const resource = resources.get(publicId);
    if (!match || !resource || resource.resourceType !== match[1]) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 }),
      );
    }
    return Promise.resolve(
      Response.json({
        public_id: resource.publicId,
        bytes: resource.bytes,
        ...(resource.format && { format: resource.format }),
        secure_url: deliveryUrl(resource),
      }),
    );
  };

  function deliveryUrl({ resourceType, publicId, format }: FakeResource): string {
    const suffix = resourceType === 'image' && format ? `.${format}` : '';
    return `https://res.cloudinary.com/${FAKE_CLOUD}/${resourceType}/upload/v1700000000/${publicId}${suffix}`;
  }

  return {
    storage: createCloudinaryStorage({
      cloudName: FAKE_CLOUD,
      apiKey: FAKE_API_KEY,
      apiSecret: FAKE_API_SECRET,
      fetch: fakeFetch,
      now: () => 1_700_000_000_000,
    }),

    /** Stores a file as if a browser uploaded it into `folder`; returns the answer it would send. */
    upload(
      folder: string,
      { name, bytes, format }: { name: string; bytes: number; format?: string },
    ): FileAnswer {
      // Cloudinary names images and keeps other files' extensions in their id.
      const resource: FakeResource = format
        ? { resourceType: 'image', publicId: `${folder}/${randomUUID()}`, bytes, format }
        : {
            resourceType: 'raw',
            publicId: `${folder}/${randomUUID()}_${name}`,
            bytes,
            format: null,
          };
      resources.set(resource.publicId, resource);
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
