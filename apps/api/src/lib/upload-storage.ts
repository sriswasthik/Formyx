import { createHash } from 'node:crypto';
import type { UploadSignature } from '@formyx/shared';
import { z } from 'zod';
import type { Env } from '../config/env.js';

/*
 * Files live in Cloudinary. Browsers upload straight to it with a signature from the API,
 * which pins the folder and the allowed formats; the API never handles the bytes. Before an
 * uploaded file is used, the API looks it up with Cloudinary to learn its real size and
 * format, since what the browser reports could be anything.
 */

/** What storage knows about an uploaded file. */
export interface StoredFile {
  publicId: string;
  /** Size in bytes, as stored. */
  bytes: number;
  /** File extension Cloudinary detected, when it detects one (images, video, audio). */
  format: string | null;
  secureUrl: string;
}

export interface UploadStorage {
  /** A signed request for one upload into `folder`, refusing other formats. */
  signUpload(input: {
    folder: string;
    allowedFormats: readonly string[];
    maxBytes: number;
  }): UploadSignature;
  /** The stored file at `url`, or `null` if it is not one of ours or does not exist. */
  describe(url: string): Promise<StoredFile | null>;
  /** The public id inside `url`, if it is a delivery URL of this account; `null` otherwise. */
  publicIdOf(url: string): string | null;
  /** Deletes the files at `urls` that are ours; others are ignored. Throws if storage refuses. */
  deleteFiles(urls: readonly string[]): Promise<void>;
}

/** Cloudinary's admin API deletes at most this many files a call. */
const DELETE_BATCH = 100;

/**
 * Cloudinary's request signature: the parameters (except file, cloud_name, resource_type and
 * api_key) sorted by name, joined as `key=value&...`, with the API secret appended, SHA-1.
 */
export function signCloudinaryParams(
  params: Readonly<Record<string, string | number>>,
  apiSecret: string,
): string {
  const payload = Object.entries(params)
    .filter(([key, value]) => value !== '' && !UNSIGNED_PARAMS.has(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
  return createHash('sha1')
    .update(payload + apiSecret)
    .digest('hex');
}

const UNSIGNED_PARAMS = new Set(['file', 'cloud_name', 'resource_type', 'api_key']);

const DELIVERY_HOST = 'res.cloudinary.com';
/** `/<cloud>/<resource type>/upload/[transformations/][v<version>/]<public id>.<ext>` */
const RESOURCE_TYPES = new Set(['image', 'video', 'raw']);

interface ParsedUrl {
  resourceType: string;
  publicId: string;
}

/** The parts of a Cloudinary delivery URL of `cloudName`, or `null` for anything else. */
export function parseCloudinaryUrl(url: string, cloudName: string): ParsedUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== DELIVERY_HOST) return null;

  const segments = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const [cloud, resourceType, deliveryType, ...rest] = segments;
  if (cloud !== cloudName || !resourceType || !RESOURCE_TYPES.has(resourceType)) return null;
  if (deliveryType !== 'upload' || rest.length === 0) return null;

  // Skip a version segment; transformations are never part of the URLs this app stores.
  const path = /^v\d+$/.test(rest[0] ?? '') ? rest.slice(1) : rest;
  if (path.length === 0 || path.some((segment) => segment === '..' || segment === '.')) return null;
  const joined = path.join('/');
  // Raw files keep their extension in the public id; images and videos do not.
  const publicId = resourceType === 'raw' ? joined : joined.replace(/\.[^./]+$/, '');
  return publicId ? { resourceType, publicId } : null;
}

const resourceSchema = z.object({
  public_id: z.string(),
  bytes: z.number().int(),
  format: z.string().optional(),
  secure_url: z.string(),
});

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Clock and network, so tests can pin them. */
  now?: () => number;
  fetch?: typeof fetch;
  /** Cloudinary's API, or a stand-in for end-to-end tests. */
  apiUrl?: string;
}

export function createCloudinaryStorage({
  cloudName,
  apiKey,
  apiSecret,
  now = Date.now,
  fetch: fetchImpl = fetch,
  apiUrl = 'https://api.cloudinary.com',
}: CloudinaryConfig): UploadStorage {
  const authorization = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;

  return {
    signUpload({ folder, allowedFormats, maxBytes }) {
      const timestamp = Math.floor(now() / 1000);
      const allowed = allowedFormats.join(',');
      const signature = signCloudinaryParams(
        { folder, allowed_formats: allowed, timestamp },
        apiSecret,
      );
      return {
        uploadUrl: `${apiUrl}/v1_1/${encodeURIComponent(cloudName)}/auto/upload`,
        apiKey,
        timestamp,
        signature,
        folder,
        allowedFormats: allowed,
        maxBytes,
      };
    },

    publicIdOf(url) {
      return parseCloudinaryUrl(url, cloudName)?.publicId ?? null;
    },

    async describe(url) {
      const parsed = parseCloudinaryUrl(url, cloudName);
      if (!parsed) return null;
      const endpoint =
        `${apiUrl}/v1_1/${encodeURIComponent(cloudName)}/resources/` +
        `${parsed.resourceType}/upload/${parsed.publicId.split('/').map(encodeURIComponent).join('/')}`;
      const res = await fetchImpl(endpoint, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Cloudinary answered ${res.status} when describing a file`);
      const resource = resourceSchema.parse(await res.json());
      return {
        publicId: resource.public_id,
        bytes: resource.bytes,
        format: resource.format ?? null,
        secureUrl: resource.secure_url,
      };
    },

    async deleteFiles(urls) {
      const byType = new Map<string, string[]>();
      for (const url of urls) {
        const parsed = parseCloudinaryUrl(url, cloudName);
        if (!parsed) continue;
        byType.set(parsed.resourceType, [
          ...(byType.get(parsed.resourceType) ?? []),
          parsed.publicId,
        ]);
      }
      for (const [resourceType, ids] of byType) {
        for (let start = 0; start < ids.length; start += DELETE_BATCH) {
          const query = new URLSearchParams();
          for (const id of ids.slice(start, start + DELETE_BATCH)) query.append('public_ids[]', id);
          const response = await fetchImpl(
            `${apiUrl}/v1_1/${encodeURIComponent(cloudName)}/resources/${resourceType}/upload?${query.toString()}`,
            { method: 'DELETE', headers: { Authorization: authorization } },
          );
          if (!response.ok) {
            throw new Error(`Cloudinary refused to delete files (${response.status})`);
          }
        }
      }
    },
  };
}

/** Cloudinary storage when the account is configured; `null` switches uploads off. */
export function createUploadStorage(
  env: Pick<
    Env,
    'CLOUDINARY_CLOUD_NAME' | 'CLOUDINARY_API_KEY' | 'CLOUDINARY_API_SECRET' | 'CLOUDINARY_API_URL'
  >,
): UploadStorage | null {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return null;
  return createCloudinaryStorage({
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    apiSecret: CLOUDINARY_API_SECRET,
    apiUrl: env.CLOUDINARY_API_URL,
  });
}

/** Where a respondent's file for one question goes: one folder per form and question. */
export function answerFolder(root: string, formId: string, fieldId: string): string {
  return `${root}/forms/${formId}/${fieldId}`;
}

/** Where a form's logo and cover image go. */
export function themeFolder(root: string, formId: string): string {
  return `${root}/themes/${formId}`;
}
