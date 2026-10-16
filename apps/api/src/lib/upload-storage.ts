import { createHash } from 'node:crypto';
import type { UploadSignature } from '@formyx/shared';
import { z } from 'zod';
import type { Env } from '../config/env.js';

/*
 * Files live in Cloudinary. Browsers upload straight to it with a signature from the API,
 * which pins the folder and the allowed formats; the API never handles the bytes. Before an
 * uploaded file is used, the API looks it up with Cloudinary to learn its real size and
 * format, since what the browser reports could be anything.
 *
 * Respondents' files are private: Cloudinary serves them to no one directly. Their answers
 * hold a Formyx file link instead (`fileLink`), which checks who asks and then sends them on
 * to a download link that works for a few minutes. Theme images stay public.
 */

/** Where a file is in Cloudinary. */
export interface FileLocation {
  resourceType: 'image' | 'video' | 'raw';
  deliveryType: 'upload' | 'private';
  publicId: string;
  /** Images' and videos' format (their id has no extension); raw files keep it in the id. */
  format?: string | undefined;
}

/** What storage knows about an uploaded file. */
export interface StoredFile {
  publicId: string;
  /** Size in bytes, as stored. */
  bytes: number;
  /** File extension Cloudinary detected, when it detects one (images, video, audio). */
  format: string | null;
  secureUrl: string;
  location: FileLocation;
}

export interface UploadStorage {
  /** A signed request for one upload into `folder`, refusing other formats. */
  signUpload(input: {
    folder: string;
    allowedFormats: readonly string[];
    maxBytes: number;
    /** Stored privately: only reachable through `downloadUrl`. */
    private?: boolean;
  }): UploadSignature;
  /** Where `url` (a delivery URL or a Formyx file link) is, or `null` if it is not ours. */
  locate(url: string): FileLocation | null;
  /** The stored file at `url`, or `null` if it is not one of ours or does not exist. */
  describe(url: string): Promise<StoredFile | null>;
  /** The public id inside `url`, if it is ours; `null` otherwise. */
  publicIdOf(url: string): string | null;
  /** Deletes the files at `urls` that are ours; others are ignored. Throws if storage refuses. */
  deleteFiles(urls: readonly string[]): Promise<void>;
  /**
   * A link that downloads the file for `seconds`: signed and expiring for private files,
   * the delivery URL for public ones.
   */
  downloadUrl(location: FileLocation, seconds: number): string;
  /** The file's first `bytes` bytes (fewer if it is shorter), to check what it really is. */
  readHead(location: FileLocation, bytes: number): Promise<Uint8Array | null>;
  /**
   * Makes a public file private, keeping its id; returns where it is now, or `null` if there
   * is no such file. A file that is already private is left as it is.
   */
  makePrivate(location: FileLocation): Promise<FileLocation | null>;
}

/** Cloudinary's admin API deletes at most this many files a call. */
const DELETE_BATCH = 100;
const REQUEST_TIMEOUT_MS = 10_000;

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
const RESOURCE_TYPES = new Set(['image', 'video', 'raw']);
const DELIVERY_TYPES = new Set(['upload', 'private']);

function isResourceType(value: string | undefined): value is FileLocation['resourceType'] {
  return value !== undefined && RESOURCE_TYPES.has(value);
}

/**
 * The parts of a Cloudinary delivery URL of `cloudName`, or `null` for anything else:
 * `/<cloud>/<resource type>/<upload|private>/[s--signature--/][v<version>/]<public id>.<ext>`.
 */
export function parseCloudinaryUrl(url: string, cloudName: string): FileLocation | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== DELIVERY_HOST) return null;

  const segments = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const [cloud, resourceType, deliveryType, ...rest] = segments;
  if (cloud !== cloudName || !isResourceType(resourceType)) return null;
  if (!deliveryType || !DELIVERY_TYPES.has(deliveryType) || rest.length === 0) return null;

  // Skip a signature and a version; transformations are never part of the URLs stored.
  let path = rest;
  if (/^s--[\w-]+--$/.test(path[0] ?? '')) path = path.slice(1);
  if (/^v\d+$/.test(path[0] ?? '')) path = path.slice(1);
  if (path.length === 0 || path.some((segment) => segment === '..' || segment === '.')) return null;
  const joined = path.join('/');
  // Raw files keep their extension in the public id; images and videos do not.
  const extension = /\.([^./]+)$/.exec(joined)?.[1];
  const publicId = resourceType === 'raw' ? joined : joined.replace(/\.[^./]+$/, '');
  if (!publicId) return null;
  return {
    resourceType,
    deliveryType: deliveryType as FileLocation['deliveryType'],
    publicId,
    ...(resourceType !== 'raw' && extension && { format: extension.toLowerCase() }),
  };
}

/**
 * The Formyx link that stands for a private file in answers:
 * `<appUrl>/api/forms/<formId>/files/<resource type>/<public id[.format]>`. Opening it needs
 * an account in the form's workspace (see the files route).
 */
export function fileLink(appUrl: string, formId: string, location: FileLocation): string {
  const file =
    location.resourceType === 'raw' || !location.format
      ? location.publicId
      : `${location.publicId}.${location.format}`;
  return `${appUrl}/api/forms/${encodeURIComponent(formId)}/files/${location.resourceType}/${encodeURIComponent(file)}`;
}

/** The private file a Formyx file link of `appUrl` stands for, or `null`. */
export function parseFileLink(
  url: string,
  appUrl: string,
): { formId: string; location: FileLocation } | null {
  if (!url.startsWith(`${appUrl}/api/forms/`)) return null;
  const match = /^\/api\/forms\/([^/]+)\/files\/([^/]+)\/([^/?#]+)$/.exec(url.slice(appUrl.length));
  if (!match) return null;
  try {
    return locationOfFile(
      decodeURIComponent(match[1] ?? ''),
      match[2],
      decodeURIComponent(match[3] ?? ''),
    );
  } catch {
    return null;
  }
}

/**
 * A private file from the parts of a file link, already decoded (as the files route receives
 * them), or `null` for anything that can't be one.
 */
export function locationOfFile(
  formId: string,
  resourceType: string | undefined,
  file: string,
): { formId: string; location: FileLocation } | null {
  if (!formId || !isResourceType(resourceType)) return null;
  if (!file || file.split('/').some((segment) => segment === '..' || segment === '.' || !segment)) {
    return null;
  }
  if (resourceType === 'raw') {
    return { formId, location: { resourceType, deliveryType: 'private', publicId: file } };
  }
  const extension = /\.([^./]+)$/.exec(file)?.[1];
  return {
    formId,
    location: {
      resourceType,
      deliveryType: 'private',
      publicId: extension ? file.slice(0, -extension.length - 1) : file,
      ...(extension && { format: extension.toLowerCase() }),
    },
  };
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
  /** The site's address, for Formyx file links. */
  appUrl?: string;
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
  appUrl = '',
  now = Date.now,
  fetch: fetchImpl = fetch,
  apiUrl = 'https://api.cloudinary.com',
}: CloudinaryConfig): UploadStorage {
  const authorization = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
  const cloud = encodeURIComponent(cloudName);
  const encodeId = (publicId: string) => publicId.split('/').map(encodeURIComponent).join('/');

  function locate(url: string): FileLocation | null {
    return (
      parseCloudinaryUrl(url, cloudName) ??
      (appUrl ? (parseFileLink(url, appUrl)?.location ?? null) : null)
    );
  }

  function downloadUrl(location: FileLocation, seconds: number): string {
    if (location.deliveryType === 'upload') {
      const file =
        location.resourceType === 'raw' || !location.format
          ? location.publicId
          : `${location.publicId}.${location.format}`;
      return `https://${DELIVERY_HOST}/${cloud}/${location.resourceType}/upload/${encodeId(file)}`;
    }
    const timestamp = Math.floor(now() / 1000);
    const params: Record<string, string | number> = {
      public_id: location.publicId,
      type: 'private',
      timestamp,
      expires_at: timestamp + seconds,
      ...(location.resourceType !== 'raw' && location.format && { format: location.format }),
    };
    const query = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
      api_key: apiKey,
      signature: signCloudinaryParams(params, apiSecret),
    });
    return `${apiUrl}/v1_1/${cloud}/${location.resourceType}/download?${query.toString()}`;
  }

  return {
    signUpload({ folder, allowedFormats, maxBytes, private: isPrivate = false }) {
      const timestamp = Math.floor(now() / 1000);
      const allowed = allowedFormats.join(',');
      const signature = signCloudinaryParams(
        { folder, allowed_formats: allowed, timestamp, ...(isPrivate && { type: 'private' }) },
        apiSecret,
      );
      return {
        uploadUrl: `${apiUrl}/v1_1/${cloud}/auto/upload`,
        apiKey,
        timestamp,
        signature,
        folder,
        allowedFormats: allowed,
        maxBytes,
        ...(isPrivate && { type: 'private' as const }),
      };
    },

    locate,

    publicIdOf(url) {
      return locate(url)?.publicId ?? null;
    },

    async describe(url) {
      const location = locate(url);
      if (!location) return null;
      const endpoint = `${apiUrl}/v1_1/${cloud}/resources/${location.resourceType}/${location.deliveryType}/${encodeId(location.publicId)}`;
      const res = await fetchImpl(endpoint, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Cloudinary answered ${res.status} when describing a file`);
      const resource = resourceSchema.parse(await res.json());
      return {
        publicId: resource.public_id,
        bytes: resource.bytes,
        format: resource.format ?? null,
        secureUrl: resource.secure_url,
        location: {
          ...location,
          ...(location.resourceType !== 'raw' && resource.format && { format: resource.format }),
        },
      };
    },

    async deleteFiles(urls) {
      const byType = new Map<string, string[]>();
      for (const url of urls) {
        const location = locate(url);
        if (!location) continue;
        const key = `${location.resourceType}/${location.deliveryType}`;
        byType.set(key, [...(byType.get(key) ?? []), location.publicId]);
      }
      for (const [key, ids] of byType) {
        for (let start = 0; start < ids.length; start += DELETE_BATCH) {
          const query = new URLSearchParams();
          for (const id of ids.slice(start, start + DELETE_BATCH)) query.append('public_ids[]', id);
          const response = await fetchImpl(
            `${apiUrl}/v1_1/${cloud}/resources/${key}?${query.toString()}`,
            { method: 'DELETE', headers: { Authorization: authorization } },
          );
          if (!response.ok) {
            throw new Error(`Cloudinary refused to delete files (${response.status})`);
          }
        }
      }
    },

    downloadUrl,

    async makePrivate(location) {
      const moved: FileLocation = { ...location, deliveryType: 'private' };
      if (location.deliveryType === 'private') return moved;
      const params = {
        from_public_id: location.publicId,
        to_public_id: location.publicId,
        type: 'upload',
        to_type: 'private',
        timestamp: Math.floor(now() / 1000),
      };
      const body = new URLSearchParams({
        ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
        api_key: apiKey,
        signature: signCloudinaryParams(params, apiSecret),
      });
      const response = await fetchImpl(`${apiUrl}/v1_1/${cloud}/${location.resourceType}/rename`, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return moved;
      if (response.status !== 404) {
        throw new Error(`Cloudinary refused to make a file private (${response.status})`);
      }
      // Not public: made private by an earlier run that stopped before saving, or gone.
      const existing = await fetchImpl(
        `${apiUrl}/v1_1/${cloud}/resources/${location.resourceType}/private/${encodeId(location.publicId)}`,
        {
          headers: { Authorization: authorization },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      if (existing.status === 404) return null;
      if (!existing.ok)
        throw new Error(`Cloudinary answered ${existing.status} when describing a file`);
      return moved;
    },

    async readHead(location, bytes) {
      const response = await fetchImpl(downloadUrl(location, 60), {
        headers: { Range: `bytes=0-${String(bytes - 1)}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok || !response.body) return null;
      // Read only what is needed, whatever the server sends.
      const body: ReadableStream<Uint8Array> = response.body;
      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      let read = 0;
      while (read < bytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        read += value.length;
      }
      await reader.cancel().catch(() => undefined);
      const head = new Uint8Array(Math.min(read, bytes));
      let offset = 0;
      for (const chunk of chunks) {
        const part = chunk.subarray(0, head.length - offset);
        head.set(part, offset);
        offset += part.length;
        if (offset >= head.length) break;
      }
      return head;
    },
  };
}

/** Cloudinary storage when the account is configured; `null` switches uploads off. */
export function createUploadStorage(
  env: Pick<
    Env,
    | 'CLOUDINARY_CLOUD_NAME'
    | 'CLOUDINARY_API_KEY'
    | 'CLOUDINARY_API_SECRET'
    | 'CLOUDINARY_API_URL'
    | 'APP_URL'
  >,
): UploadStorage | null {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return null;
  return createCloudinaryStorage({
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    apiSecret: CLOUDINARY_API_SECRET,
    apiUrl: env.CLOUDINARY_API_URL,
    appUrl: env.APP_URL,
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
