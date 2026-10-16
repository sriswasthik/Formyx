import {
  cloudinaryUploadResultSchema,
  uploadSignatureSchema,
  type CloudinaryUploadResult,
  type UploadSignature,
  type UploadSignatureQuery,
} from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, ApiRequestError } from './api';

/**
 * Asks the API to sign one upload. Fails with 503 `UPLOADS_UNAVAILABLE` if uploads are off.
 * `headers` carry a respondent's unlock token for a password-protected form.
 */
export function getUploadSignature(
  query: UploadSignatureQuery,
  headers: Record<string, string> = {},
): Promise<UploadSignature> {
  const params = new URLSearchParams(Object.entries(query));
  return apiRequest(`/uploads/signature?${params.toString()}`, uploadSignatureSchema, { headers });
}

/** Why an upload to storage did not finish. */
export class UploadError extends Error {
  readonly reason: 'aborted' | 'rejected' | 'network';

  constructor(reason: UploadError['reason'], message: string) {
    super(message);
    this.name = 'UploadError';
    this.reason = reason;
  }
}

export interface UploadOptions {
  /** Called as the file goes up, with how much of it has been sent (0–1). */
  onProgress?: (fraction: number) => void;
  /** Cancels the upload; it then fails with an `UploadError` whose reason is `aborted`. */
  signal?: AbortSignal;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const storageErrorSchema = z.object({ error: z.object({ message: z.string() }) });

/** Storage's reason for turning a file away, in the app's words. */
function rejectionMessage(body: unknown): string {
  const message = storageErrorSchema.safeParse(body).data?.error.message ?? '';
  if (/format/i.test(message)) return 'This type of file isn’t accepted here';
  if (/too large|size/i.test(message)) return 'This file is too big';
  return 'The upload could not be completed. Try again.';
}

/**
 * Sends `file` straight to storage, with a signature from `getUploadSignature`. Uses
 * XMLHttpRequest because, unlike fetch, it reports how much of a request body has been sent.
 */
export function uploadToStorage(
  signature: UploadSignature,
  file: File,
  { onProgress, signal }: UploadOptions = {},
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadError('aborted', 'The upload was cancelled'));
      return;
    }

    const body = new FormData();
    body.append('file', file);
    body.append('api_key', signature.apiKey);
    body.append('timestamp', String(signature.timestamp));
    body.append('signature', signature.signature);
    body.append('folder', signature.folder);
    body.append('allowed_formats', signature.allowedFormats);
    if (signature.type) body.append('type', signature.type);

    const xhr = new XMLHttpRequest();
    const abort = () => {
      xhr.abort();
    };
    const settle = () => {
      signal?.removeEventListener('abort', abort);
    };
    signal?.addEventListener('abort', abort, { once: true });

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    });
    xhr.addEventListener('load', () => {
      settle();
      const response = parseJson(xhr.responseText);
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new UploadError('rejected', rejectionMessage(response)));
        return;
      }
      const parsed = cloudinaryUploadResultSchema.safeParse(response);
      if (parsed.success) resolve(parsed.data);
      else reject(new UploadError('rejected', 'The upload could not be completed. Try again.'));
    });
    xhr.addEventListener('error', () => {
      settle();
      reject(new UploadError('network', 'The upload failed. Check your connection and try again.'));
    });
    xhr.addEventListener('abort', () => {
      settle();
      reject(new UploadError('aborted', 'The upload was cancelled'));
    });

    xhr.open('POST', signature.uploadUrl);
    xhr.send(body);
  });
}

export function isUploadCancelled(error: unknown): boolean {
  return error instanceof UploadError && error.reason === 'aborted';
}

/** What to tell people when getting a signature or uploading failed. */
export function uploadErrorMessage(error: unknown): string {
  if (error instanceof UploadError) return error.message;
  if (error instanceof ApiRequestError) {
    if (error.code === 'UPLOADS_UNAVAILABLE') return 'File uploads aren’t available right now.';
    if (error.code === 'FORM_CLOSED') return 'This form is no longer accepting responses.';
    if (error.code === 'RATE_LIMITED' || error.code === 'DEMO_RESTRICTED') return error.message;
  }
  return 'The upload could not start. Check your connection and try again.';
}
