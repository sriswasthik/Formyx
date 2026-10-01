import { z } from 'zod';
import { emailSchema } from './auth.js';
import { roleSchema } from './roles.js';

export const WORKSPACE_NAME_MAX_LENGTH = 60;

export const workspaceNameSchema = z
  .string({ error: 'Enter a name' })
  .trim()
  .min(1, 'Enter a name')
  .max(WORKSPACE_NAME_MAX_LENGTH, `Use ${WORKSPACE_NAME_MAX_LENGTH} characters or fewer`);

/** Body of `POST /api/workspaces` and `PATCH /api/workspaces/:workspaceId`. */
export const workspaceInputSchema = z.object({ name: workspaceNameSchema });
export type WorkspaceInput = z.infer<typeof workspaceInputSchema>;

export const memberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  joinedAt: z.iso.datetime(),
});
export type Member = z.infer<typeof memberSchema>;

export const membersResponseSchema = z.object({ members: z.array(memberSchema) });
export type MembersResponse = z.infer<typeof membersResponseSchema>;

/** Body of `PATCH /api/workspaces/:workspaceId/members/:userId`. */
export const updateMemberInputSchema = z.object({ role: roleSchema });
export type UpdateMemberInput = z.infer<typeof updateMemberInputSchema>;

/** How long an invite link works. */
export const INVITE_TTL_DAYS = 7;

/** Body of `POST /api/workspaces/:workspaceId/invites`. */
export const createInviteInputSchema = z.object({
  email: emailSchema,
  role: roleSchema.default('EDITOR'),
});
export type CreateInviteInput = z.input<typeof createInviteInputSchema>;

export const INVITE_STATUSES = ['pending', 'accepted', 'expired', 'revoked'] as const;
export const inviteStatusSchema = z.enum(INVITE_STATUSES);
export type InviteStatus = z.infer<typeof inviteStatusSchema>;

/** A pending invite, as owners see it. */
export const inviteSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: roleSchema,
  invitedBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type Invite = z.infer<typeof inviteSchema>;

export const invitesResponseSchema = z.object({ invites: z.array(inviteSchema) });
export type InvitesResponse = z.infer<typeof invitesResponseSchema>;

/** Response of sending an invite, or sending it again. */
export const sentInviteSchema = z.object({
  invite: inviteSchema,
  /** False when the email service failed; the invite still exists and can be sent again. */
  emailSent: z.boolean(),
});
export type SentInvite = z.infer<typeof sentInviteSchema>;

/** Whether an invite still works, judged at `now`. */
export function inviteStatus(
  invite: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): InviteStatus {
  if (invite.acceptedAt) return 'accepted';
  if (invite.revokedAt) return 'revoked';
  return invite.expiresAt.getTime() <= now.getTime() ? 'expired' : 'pending';
}

/** What `GET /api/invites/:token` shows anyone holding the link. */
export const invitePreviewSchema = z.object({
  status: inviteStatusSchema,
  workspaceName: z.string(),
  email: z.string(),
  role: roleSchema,
  invitedBy: z.string().nullable(),
  expiresAt: z.iso.datetime(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

/** `details` of the 410 INVITE_UNAVAILABLE for a link that no longer works. */
export const inviteUnavailableDetailsSchema = z.object({
  status: inviteStatusSchema.exclude(['pending']),
});
