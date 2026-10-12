import {
  deleteAllResponsesResponseSchema,
  formSettingsViewSchema,
  type AutoresponderSettings,
  type ChatService,
  type DeleteAllResponsesResponse,
  type FormSettingsView,
  type UpdateFormSettingsInput,
} from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

export const formSettingsKey = (formId: string) => ['forms', formId, 'settings'] as const;

const base = (formId: string) => `/forms/${encodeURIComponent(formId)}`;

export function getFormSettings(formId: string): Promise<FormSettingsView> {
  return apiRequest(`${base(formId)}/settings`, formSettingsViewSchema);
}

/** Replaces the sections given; they take effect at once. */
export function updateFormSettings(
  formId: string,
  input: UpdateFormSettingsInput,
): Promise<FormSettingsView> {
  return apiRequest(
    `${base(formId)}/settings`,
    formSettingsViewSchema,
    jsonRequest('PATCH', input),
  );
}

/** Sets the form's password, or removes it with `null`. */
export function setFormPassword(
  formId: string,
  password: string | null,
): Promise<FormSettingsView> {
  return apiRequest(
    `${base(formId)}/settings/password`,
    formSettingsViewSchema,
    jsonRequest('PUT', { password }),
  );
}

export function setChatWebhook(
  formId: string,
  service: ChatService,
  url: string | null,
): Promise<FormSettingsView> {
  return apiRequest(
    `${base(formId)}/settings/chat`,
    formSettingsViewSchema,
    jsonRequest('PUT', { service, url }),
  );
}

export function testChatWebhook(formId: string, service: ChatService): Promise<void> {
  return apiRequest(
    `${base(formId)}/settings/chat/test`,
    z.undefined(),
    jsonRequest('POST', { service }),
  );
}

export function changeFormSlug(formId: string, slug: string): Promise<FormSettingsView> {
  return apiRequest(`${base(formId)}/slug`, formSettingsViewSchema, jsonRequest('PUT', { slug }));
}

/** Emails the signed-in person the autoresponder as it would look. */
export function sendAutoresponderTest(
  formId: string,
  autoresponder: AutoresponderSettings,
): Promise<void> {
  return apiRequest(
    `${base(formId)}/settings/autoresponder/test`,
    z.undefined(),
    jsonRequest('POST', { autoresponder }),
  );
}

export function deleteAllResponses(
  formId: string,
  confirm: string,
): Promise<DeleteAllResponsesResponse> {
  return apiRequest(
    `${base(formId)}/submissions/delete-all`,
    deleteAllResponsesResponseSchema,
    jsonRequest('POST', { confirm }),
  );
}

/** Where the browser downloads the responses from. */
export function exportUrl(formId: string, format: 'csv' | 'xlsx'): string {
  return `/api${base(formId)}/submissions/${format === 'csv' ? 'export' : 'export.xlsx'}`;
}
