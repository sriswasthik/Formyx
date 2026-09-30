import {
  publicFormResponseSchema,
  submissionResponseSchema,
  type PublicFormResponse,
  type SubmissionInput,
  type SubmissionResponse,
} from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

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
