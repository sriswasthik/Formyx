import {
  formDetailSchema,
  formListResponseSchema,
  type CreateFormInput,
  type FormDetail,
  type FormStatus,
  type FormSummary,
  type PublishFormInput,
  type UpdateFormInput,
} from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

export interface FormFilters {
  search?: string;
  status?: FormStatus;
}

const workspaceFormsPath = (workspaceId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/forms`;
const formPath = (formId: string) => `/forms/${encodeURIComponent(formId)}`;

export async function listForms(workspaceId: string, filters: FormFilters): Promise<FormSummary[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status.toLowerCase());
  const query = params.toString();

  const { forms } = await apiRequest(
    `${workspaceFormsPath(workspaceId)}${query ? `?${query}` : ''}`,
    formListResponseSchema,
  );
  return forms;
}

export function createForm(workspaceId: string, input: CreateFormInput): Promise<FormDetail> {
  return apiRequest(workspaceFormsPath(workspaceId), formDetailSchema, jsonRequest('POST', input));
}

export function getForm(formId: string): Promise<FormDetail> {
  return apiRequest(formPath(formId), formDetailSchema);
}

export function updateForm(formId: string, input: UpdateFormInput): Promise<FormDetail> {
  return apiRequest(formPath(formId), formDetailSchema, jsonRequest('PATCH', input));
}

export function duplicateForm(formId: string): Promise<FormDetail> {
  return apiRequest(`${formPath(formId)}/duplicate`, formDetailSchema, { method: 'POST' });
}

export async function deleteForm(formId: string): Promise<void> {
  await apiRequest(formPath(formId), z.undefined(), { method: 'DELETE' });
}

/** Puts the draft live. Rejected with 409 if the draft changed since `version`, 422 if unfinished. */
export function publishForm(formId: string, version: number): Promise<FormDetail> {
  return apiRequest(
    `${formPath(formId)}/publish`,
    formDetailSchema,
    jsonRequest('POST', { version } satisfies PublishFormInput),
  );
}

export function closeForm(formId: string): Promise<FormDetail> {
  return apiRequest(`${formPath(formId)}/close`, formDetailSchema, { method: 'POST' });
}

export function reopenForm(formId: string): Promise<FormDetail> {
  return apiRequest(`${formPath(formId)}/reopen`, formDetailSchema, { method: 'POST' });
}
