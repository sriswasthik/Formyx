import {
  adminWorkspaceSchema,
  adminWorkspacesResponseSchema,
  type AdminWorkspace,
  type ExtendTrialInput,
  type GrantComplimentaryInput,
} from '@formyx/shared';
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
