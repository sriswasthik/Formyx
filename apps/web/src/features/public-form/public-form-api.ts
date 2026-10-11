import {
  draftResponseSchema,
  publicFormResponseSchema,
  submissionResponseSchema,
  viewResponseSchema,
  type DraftResponse,
  type ProgressInput,
  type PublicFormResponse,
  type SaveDraftInput,
  type SubmissionInput,
  type SubmissionResponse,
} from '@formyx/shared';
import { z } from 'zod';
import type { FileUploader } from '@/features/form-renderer/file-uploads';
import { apiRequest, jsonRequest, readApiResponse } from '@/lib/api';

const publicFormPath = (slug: string) => `/public/forms/${encodeURIComponent(slug)}`;

/** The request index.html started for `slug`, if any; it can be used once. */
function takePrefetched(slug: string): Promise<Response> | null {
  const prefetch = window.__formyxPrefetch;
  if (prefetch?.slug !== slug) return null;
  delete window.__formyxPrefetch;
  return prefetch.response;
}

/** The published form, or that it is closed. Fails with 404 if it was never published. */
export function getPublicForm(slug: string): Promise<PublicFormResponse> {
  const prefetched = takePrefetched(slug);
  return prefetched
    ? readApiResponse(prefetched, publicFormResponseSchema)
    : apiRequest(publicFormPath(slug), publicFormResponseSchema);
}

/** Counts a visit; the token ties this visit's progress reports to it. */
export async function recordFormView(slug: string): Promise<string> {
  const { token } = await apiRequest(`${publicFormPath(slug)}/view`, viewResponseSchema, {
    method: 'POST',
  });
  return token;
}

/** How far the visit got. Best effort, and sent even as the page closes. */
export function reportProgress(slug: string, input: ProgressInput): Promise<void> {
  return apiRequest(`${publicFormPath(slug)}/progress`, z.undefined(), {
    ...jsonRequest('POST', input),
    keepalive: true,
  });
}

/** Saves answers to finish later; the API emails the respondent a link. */
export function saveDraft(slug: string, input: SaveDraftInput): Promise<void> {
  return apiRequest(`${publicFormPath(slug)}/drafts`, z.undefined(), jsonRequest('POST', input));
}

/** The answers behind an emailed link's token. */
export function resumeDraft(slug: string, token: string): Promise<DraftResponse> {
  return apiRequest(
    `${publicFormPath(slug)}/drafts/resume`,
    draftResponseSchema,
    jsonRequest('POST', { token }),
  );
}

export function submitResponse(slug: string, input: SubmissionInput): Promise<SubmissionResponse> {
  return apiRequest(
    `${publicFormPath(slug)}/submissions`,
    submissionResponseSchema,
    jsonRequest('POST', input),
  );
}

/** Uploads respondents' files for the published form `slug`, straight to storage. */
export function answerUploader(slug: string): FileUploader {
  return async (field, file, options) => {
    // Loaded with the first upload: most forms take no files, and the controls that do load
    // the same module anyway.
    const { getUploadSignature, uploadToStorage } = await import('@/lib/uploads');
    const signature = await getUploadSignature({ purpose: 'answer', form: slug, field: field.id });
    const stored = await uploadToStorage(signature, file, options);
    return {
      url: stored.secure_url,
      publicId: stored.public_id,
      name: file.name.slice(0, 255),
      size: stored.bytes,
      type: file.type.slice(0, 255),
    };
  };
}
