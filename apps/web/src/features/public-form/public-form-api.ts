import {
  accessTokenResponseSchema,
  publicFormResponseSchema,
  submissionResponseSchema,
  viewResponseSchema,
  type DraftResponse,
  type EditLoadResponse,
  type ProgressInput,
  type PublicFormResponse,
  type SaveDraftInput,
  type SubmissionInput,
  type SubmissionResponse,
} from '@formyx/shared';
import { z } from 'zod';
import type { FileUploader } from '@/features/form-renderer/file-uploads';
import { apiRequest, jsonRequest, readApiResponse } from '@/lib/api';
import { accessHeaders } from './form-access';

const publicFormPath = (slug: string) => `/public/forms/${encodeURIComponent(slug)}`;

/** A request for `slug`, carrying this tab's unlock token when it has one. */
function withAccess(slug: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(accessHeaders(slug))) headers.set(name, value);
  return { ...init, headers };
}

function post(slug: string, body: unknown): RequestInit {
  return withAccess(slug, jsonRequest('POST', body));
}

/** The request index.html started for `slug`, if any; it can be used once. */
function takePrefetched(slug: string): Promise<Response> | null {
  const prefetch = window.__formyxPrefetch;
  if (prefetch?.slug !== slug) return null;
  delete window.__formyxPrefetch;
  return prefetch.response;
}

/**
 * The published form; or that it is closed, not open yet or needs its password. Fails with
 * 404 if it was never published.
 */
export function getPublicForm(slug: string): Promise<PublicFormResponse> {
  const prefetched = takePrefetched(slug);
  return prefetched
    ? readApiResponse(prefetched, publicFormResponseSchema)
    : apiRequest(publicFormPath(slug), publicFormResponseSchema, withAccess(slug));
}

/** Unlocks a password-protected form: the token to send with its requests. */
export async function unlockForm(slug: string, password: string): Promise<string> {
  const { token } = await apiRequest(
    `${publicFormPath(slug)}/unlock`,
    accessTokenResponseSchema,
    jsonRequest('POST', { password }),
  );
  return token;
}

/** Emails a code to `email`, to confirm it for one response per person. */
export function sendVerificationCode(slug: string, email: string): Promise<void> {
  return apiRequest(`${publicFormPath(slug)}/verify`, z.undefined(), post(slug, { email }));
}

/** Checks the emailed code; the token proves the address was confirmed. */
export async function checkVerificationCode(
  slug: string,
  email: string,
  code: string,
): Promise<string> {
  const { token } = await apiRequest(
    `${publicFormPath(slug)}/verify/check`,
    accessTokenResponseSchema,
    post(slug, { email, code }),
  );
  return token;
}

/** Counts a visit; the token ties this visit's progress reports to it. */
export async function recordFormView(slug: string): Promise<string> {
  const { token } = await apiRequest(
    `${publicFormPath(slug)}/view`,
    viewResponseSchema,
    withAccess(slug, { method: 'POST' }),
  );
  return token;
}

/** How far the visit got. Best effort, and sent even as the page closes. */
export function reportProgress(slug: string, input: ProgressInput): Promise<void> {
  return apiRequest(`${publicFormPath(slug)}/progress`, z.undefined(), {
    ...post(slug, input),
    keepalive: true,
  });
}

/** Saves answers to finish later; the API emails the respondent a link. */
export function saveDraft(slug: string, input: SaveDraftInput): Promise<void> {
  return apiRequest(`${publicFormPath(slug)}/drafts`, z.undefined(), post(slug, input));
}

/** The answers behind an emailed link's token. */
export async function resumeDraft(slug: string, token: string): Promise<DraftResponse> {
  const { draftResponseSchema } = await import('./draft-schema');
  return apiRequest(
    `${publicFormPath(slug)}/drafts/resume`,
    draftResponseSchema,
    post(slug, { token }),
  );
}

/** The answers behind a link to change a response. */
export async function loadEdit(slug: string, token: string): Promise<EditLoadResponse> {
  const { editLoadResponseSchema } = await import('./draft-schema');
  return apiRequest(`${publicFormPath(slug)}/edit`, editLoadResponseSchema, post(slug, { token }));
}

export function submitResponse(slug: string, input: SubmissionInput): Promise<SubmissionResponse> {
  return apiRequest(
    `${publicFormPath(slug)}/submissions`,
    submissionResponseSchema,
    post(slug, input),
  );
}

/** Uploads respondents' files for the published form `slug`, straight to storage. */
export function answerUploader(slug: string): FileUploader {
  return async (field, file, options) => {
    // Loaded with the first upload: most forms take no files, and the controls that do load
    // the same module anyway.
    const { getUploadSignature, uploadToStorage } = await import('@/lib/uploads');
    const signature = await getUploadSignature(
      { purpose: 'answer', form: slug, field: field.id },
      accessHeaders(slug),
    );
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
