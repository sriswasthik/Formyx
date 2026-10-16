import {
  accountDeletionSchema,
  adminDataRequestsSchema,
  dataExportSchema,
  dataExportsSchema,
  respondentDeleteResponseSchema,
  respondentLookupResponseSchema,
  type AccountDeletion,
  type AdminDataRequest,
  type DataExport,
  type RequestAccountDeletionInput,
  type RespondentLookupResponse,
} from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

export const privacyKeys = {
  deletion: ['account', 'deletion'] as const,
  exports: ['account', 'exports'] as const,
  respondent: (workspaceId: string, email: string) =>
    ['workspaces', workspaceId, 'respondent-data', email] as const,
  adminRequests: ['admin', 'data-requests'] as const,
};

/** What deleting the account would do, and whether it is already scheduled. */
export function getAccountDeletion(): Promise<AccountDeletion> {
  return apiRequest('/account/deletion', accountDeletionSchema);
}

/** Schedules the deletion a week ahead; the session ends with it. */
export async function requestAccountDeletion(input: RequestAccountDeletionInput): Promise<string> {
  const { scheduledFor } = await apiRequest(
    '/account/delete',
    z.object({ scheduledFor: z.string() }),
    jsonRequest('POST', input),
  );
  return scheduledFor;
}

/** Keeps the signed-in account that was to be deleted. */
export function restoreAccount(): Promise<void> {
  return apiRequest('/account/restore', z.undefined(), jsonRequest('POST', {}));
}

/** Keeps the account the emailed link belongs to, without signing in. */
export function restoreAccountByLink(token: string): Promise<void> {
  return apiRequest('/public/account/restore', z.undefined(), jsonRequest('POST', { token }));
}

export async function listDataExports(): Promise<DataExport[]> {
  const { exports } = await apiRequest('/account/exports', dataExportsSchema);
  return exports;
}

export function requestDataExport(): Promise<DataExport> {
  return apiRequest('/account/exports', dataExportSchema, jsonRequest('POST', {}));
}

/** The ZIP's address: a plain link, so the browser downloads it with the session cookie. */
export const dataExportDownloadUrl = (exportId: string) =>
  `/api/account/exports/${encodeURIComponent(exportId)}/download`;

const respondentPath = (workspaceId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/respondent-data`;

export function lookupRespondent(
  workspaceId: string,
  email: string,
): Promise<RespondentLookupResponse> {
  return apiRequest(
    `${respondentPath(workspaceId)}?${new URLSearchParams({ email }).toString()}`,
    respondentLookupResponseSchema,
  );
}

export async function deleteRespondentData(workspaceId: string, email: string): Promise<number> {
  const { deleted } = await apiRequest(
    `${respondentPath(workspaceId)}/delete`,
    respondentDeleteResponseSchema,
    jsonRequest('POST', { email }),
  );
  return deleted;
}

export async function getAdminDataRequests(): Promise<AdminDataRequest[]> {
  const { requests } = await apiRequest('/admin/data-requests', adminDataRequestsSchema);
  return requests;
}
