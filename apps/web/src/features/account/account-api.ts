import {
  accountPreferencesSchema,
  workspacePreferencesSchema,
  type AccountPreferences,
  type ChangePasswordInput,
  type SetPasswordInput,
  type WorkspacePreferences,
} from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

export const accountKeys = {
  preferences: ['account', 'preferences'] as const,
  workspacePreferences: (workspaceId: string) =>
    ['workspaces', workspaceId, 'preferences'] as const,
};

export function getAccountPreferences(): Promise<AccountPreferences> {
  return apiRequest('/account/preferences', accountPreferencesSchema);
}

export function updateAccountPreferences(
  preferences: AccountPreferences,
): Promise<AccountPreferences> {
  return apiRequest(
    '/account/preferences',
    accountPreferencesSchema,
    jsonRequest('PUT', preferences),
  );
}

/** Signs out every other session; this one carries on. */
export function changePassword(input: ChangePasswordInput): Promise<void> {
  return apiRequest('/account/password', z.undefined(), jsonRequest('POST', input));
}

/** A first password, for an account made through Google or Zoho. Other sessions end. */
export function setFirstPassword(input: SetPasswordInput): Promise<void> {
  return apiRequest('/account/password/set', z.undefined(), jsonRequest('POST', input));
}

const workspacePath = (workspaceId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/preferences`;

export function getWorkspacePreferences(workspaceId: string): Promise<WorkspacePreferences> {
  return apiRequest(workspacePath(workspaceId), workspacePreferencesSchema);
}

export function updateWorkspacePreferences(
  workspaceId: string,
  preferences: WorkspacePreferences,
): Promise<WorkspacePreferences> {
  return apiRequest(
    workspacePath(workspaceId),
    workspacePreferencesSchema,
    jsonRequest('PUT', preferences),
  );
}
