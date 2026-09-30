import {
  publicFormSchema,
  submissionResponseSchema,
  type PublicForm,
  type SubmissionInput,
  type SubmissionResponse,
} from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

const publicFormPath = (slug: string) => `/public/forms/${encodeURIComponent(slug)}`;

/** The published form. Fails with 404 if there is none, 410 if it takes no responses. */
export function getPublicForm(slug: string): Promise<PublicForm> {
  return apiRequest(publicFormPath(slug), publicFormSchema);
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
