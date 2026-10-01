import {
  publicFormResponseSchema,
  submissionResponseSchema,
  type PublicFormResponse,
  type SubmissionInput,
  type SubmissionResponse,
} from '@formyx/shared';
import { z } from 'zod';
import type { FileUploader } from '@/features/form-renderer/file-uploads';
import { apiRequest, jsonRequest } from '@/lib/api';
import { getUploadSignature, uploadToStorage } from '@/lib/uploads';

const publicFormPath = (slug: string) => `/public/forms/${encodeURIComponent(slug)}`;

/** The published form, or that it is closed. Fails with 404 if it was never published. */
export function getPublicForm(slug: string): Promise<PublicFormResponse> {
  return apiRequest(publicFormPath(slug), publicFormResponseSchema);
}

export async function recordFormView(slug: string): Promise<void> {
  await apiRequest(`${publicFormPath(slug)}/view`, z.undefined(), { method: 'POST' });
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
