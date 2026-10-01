import {
  invitePreviewSchema,
  invitesResponseSchema,
  memberSchema,
  membersResponseSchema,
  sentInviteSchema,
  workspaceSummarySchema,
  type CreateInviteInput,
  type Invite,
  type InvitePreview,
  type Member,
  type Role,
  type SentInvite,
  type WorkspaceSummary,
} from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

const workspacePath = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}`;
const invitePath = (token: string) => `/invites/${encodeURIComponent(token)}`;

export function createWorkspace(name: string): Promise<WorkspaceSummary> {
  return apiRequest('/workspaces', workspaceSummarySchema, jsonRequest('POST', { name }));
}

export function renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceSummary> {
  return apiRequest(
    workspacePath(workspaceId),
    workspaceSummarySchema,
    jsonRequest('PATCH', { name }),
  );
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await apiRequest(workspacePath(workspaceId), z.undefined(), { method: 'DELETE' });
}

export async function listMembers(workspaceId: string): Promise<Member[]> {
  const { members } = await apiRequest(
    `${workspacePath(workspaceId)}/members`,
    membersResponseSchema,
  );
  return members;
}

export function changeMemberRole(workspaceId: string, userId: string, role: Role): Promise<Member> {
  return apiRequest(
    `${workspacePath(workspaceId)}/members/${encodeURIComponent(userId)}`,
    memberSchema,
    jsonRequest('PATCH', { role }),
  );
}

/** Removes a member; with the caller's own id, leaves the workspace. */
export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  await apiRequest(
    `${workspacePath(workspaceId)}/members/${encodeURIComponent(userId)}`,
    z.undefined(),
    { method: 'DELETE' },
  );
}

export async function listInvites(workspaceId: string): Promise<Invite[]> {
  const { invites } = await apiRequest(
    `${workspacePath(workspaceId)}/invites`,
    invitesResponseSchema,
  );
  return invites;
}

export function sendInvite(workspaceId: string, input: CreateInviteInput): Promise<SentInvite> {
  return apiRequest(
    `${workspacePath(workspaceId)}/invites`,
    sentInviteSchema,
    jsonRequest('POST', input),
  );
}

export function resendInvite(workspaceId: string, inviteId: string): Promise<SentInvite> {
  return apiRequest(
    `${workspacePath(workspaceId)}/invites/${encodeURIComponent(inviteId)}/resend`,
    sentInviteSchema,
    { method: 'POST' },
  );
}

export async function revokeInvite(workspaceId: string, inviteId: string): Promise<void> {
  await apiRequest(
    `${workspacePath(workspaceId)}/invites/${encodeURIComponent(inviteId)}`,
    z.undefined(),
    { method: 'DELETE' },
  );
}

export function getInvitePreview(token: string): Promise<InvitePreview> {
  return apiRequest(invitePath(token), invitePreviewSchema);
}

export function acceptInvite(token: string): Promise<WorkspaceSummary> {
  return apiRequest(`${invitePath(token)}/accept`, workspaceSummarySchema, { method: 'POST' });
}
