import {
  adminFormReviewSchema,
  adminReviewQueueSchema,
  adminWorkspaceSchema,
  adminWorkspacesResponseSchema,
  type AdminFormAction,
  type AdminFormReview,
  type AdminReviewItem,
  type AdminWorkspace,
  type ExtendTrialInput,
  type GrantComplimentaryInput,
} from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

const workspacePath = (workspaceId: string) =>
  `/admin/workspaces/${encodeURIComponent(workspaceId)}`;

export async function searchWorkspaces(query: string): Promise<AdminWorkspace[]> {
  const params = new URLSearchParams({ query });
  return (await apiRequest(`/admin/workspaces?${params.toString()}`, adminWorkspacesResponseSchema))
    .workspaces;
}

export function grantComplimentary(
  workspaceId: string,
  input: GrantComplimentaryInput,
): Promise<AdminWorkspace> {
  return apiRequest(
    `${workspacePath(workspaceId)}/complimentary`,
    adminWorkspaceSchema,
    jsonRequest('POST', input),
  );
}

export function endComplimentary(workspaceId: string): Promise<AdminWorkspace> {
  return apiRequest(`${workspacePath(workspaceId)}/complimentary`, adminWorkspaceSchema, {
    method: 'DELETE',
  });
}

export function extendTrial(workspaceId: string, input: ExtendTrialInput): Promise<AdminWorkspace> {
  return apiRequest(
    `${workspacePath(workspaceId)}/extend-trial`,
    adminWorkspaceSchema,
    jsonRequest('POST', input),
  );
}

/** Held and reported forms, held first. */
export async function getReviewQueue(): Promise<AdminReviewItem[]> {
  return (await apiRequest('/admin/review', adminReviewQueueSchema)).items;
}

export function getFormReview(formId: string): Promise<AdminFormReview> {
  return apiRequest(`/admin/review/${encodeURIComponent(formId)}`, adminFormReviewSchema);
}

export function actOnForm(
  formId: string,
  action: AdminFormAction,
  note?: string,
): Promise<AdminFormReview> {
  return apiRequest(
    `/admin/review/${encodeURIComponent(formId)}`,
    adminFormReviewSchema,
    jsonRequest('POST', { action, ...(note && { note }) }),
  );
}

export function setUserSuspended(userId: string, suspended: boolean, note?: string): Promise<void> {
  return apiRequest(
    `/admin/users/${encodeURIComponent(userId)}/suspension`,
    z.undefined(),
    jsonRequest('POST', { suspended, ...(note && { note }) }),
  );
}
