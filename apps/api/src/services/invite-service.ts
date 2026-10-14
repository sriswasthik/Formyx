import { createHash, randomBytes } from 'node:crypto';
import {
  INVITE_TTL_DAYS,
  inviteStatus,
  type CreateInviteInput,
  type Invite,
  type InvitePreview,
  type InviteStatus,
  type Role,
  type SentInvite,
  type WorkspaceSummary,
} from '@formyx/shared';
import type { Logger } from 'pino';
import { AppError } from '../lib/app-error.js';
import type { Mailer } from '../lib/mailer.js';
import type { Database } from '../lib/prisma.js';
import { renderInviteEmail } from '../notifications/invite-email.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 256 random bits, URL-safe. Only the person the email reaches ever sees it. */
function newInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What is stored instead of the token, so a copy of the database cannot be used to join. */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface InviteService {
  /** Invites that were neither accepted nor revoked, newest first; expired ones included. */
  list(workspaceId: string): Promise<Invite[]>;
  /** Invites `email`, or invites them again if an invite is open, and emails the link. */
  send(
    workspaceId: string,
    invitedById: string,
    input: Required<CreateInviteInput>,
  ): Promise<SentInvite>;
  /** A fresh link for an open invite, valid for another week. The old link stops working. */
  resend(workspaceId: string, inviteId: string): Promise<SentInvite>;
  revoke(workspaceId: string, inviteId: string): Promise<void>;
  /** What the link is for, for anyone holding it. 404 for unknown tokens. */
  preview(token: string): Promise<InvitePreview>;
  /** Joins the workspace. Only the invited email can; a used or expired link gets 410. */
  accept(token: string, userId: string): Promise<WorkspaceSummary>;
}

interface InviteDependencies {
  prisma: Database;
  mailer: Mailer;
  logger: Logger;
  /** Where the web app lives, for the link in the email. */
  appUrl: string;
  now?: () => Date;
}

const inviteSelect = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  invitedBy: { select: { name: true } },
  workspace: { select: { id: true, name: true, slug: true } },
} as const;

interface InviteRecord {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invitedBy: { name: string } | null;
  workspace: { id: string; name: string; slug: string };
}

function toInvite(record: InviteRecord): Invite {
  return {
    id: record.id,
    email: record.email,
    role: record.role,
    invitedBy: record.invitedBy?.name ?? null,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  };
}

function inviteNotFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Invite not found');
}

const UNAVAILABLE_MESSAGES: Record<Exclude<InviteStatus, 'pending'>, string> = {
  accepted: 'This invite has already been used.',
  expired: 'This invite has expired. Ask for a new one.',
  revoked: 'This invite was withdrawn.',
};

function inviteUnavailable(status: Exclude<InviteStatus, 'pending'>): AppError {
  return new AppError(410, 'INVITE_UNAVAILABLE', UNAVAILABLE_MESSAGES[status], {
    details: { status },
  });
}

/** Open invites: not used and not withdrawn (expired ones can still be sent again). */
const OPEN = { acceptedAt: null, revokedAt: null } as const;

export function createInviteService({
  prisma,
  mailer,
  logger,
  appUrl,
  now = () => new Date(),
}: InviteDependencies): InviteService {
  const expiry = () => new Date(now().getTime() + INVITE_TTL_DAYS * DAY_MS);

  /** Emails the link. A failure is logged and reported, never thrown: the invite stays. */
  async function deliver(record: InviteRecord, token: string): Promise<boolean> {
    const email = renderInviteEmail({
      workspaceName: record.workspace.name,
      inviterName: record.invitedBy?.name ?? null,
      role: record.role,
      acceptUrl: `${appUrl}/invite/${token}`,
      appUrl,
    });
    try {
      await mailer.send([{ to: record.email, ...email }], {
        // One email per link: a new link (sending again) is a new email.
        idempotencyKey: `invite/${record.id}/${hashInviteToken(token).slice(0, 16)}`,
      });
      return true;
    } catch (error) {
      logger.error({ inviteId: record.id, err: error }, 'Could not send the invite email');
      return false;
    }
  }

  return {
    async list(workspaceId) {
      const records = await prisma.invite.findMany({
        where: { workspaceId, ...OPEN },
        select: inviteSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      return records.map(toInvite);
    },

    async send(workspaceId, invitedById, { email, role }) {
      const member = await prisma.membership.findFirst({
        where: { workspaceId, user: { email } },
        select: { userId: true },
      });
      if (member) {
        const message = 'This person is already a member of the workspace';
        throw new AppError(409, 'CONFLICT', message, { details: [{ path: 'email', message }] });
      }

      const token = newInviteToken();
      const data = {
        role,
        invitedById,
        tokenHash: hashInviteToken(token),
        expiresAt: expiry(),
      };
      // Inviting someone again replaces their open invite rather than adding another.
      const open = await prisma.invite.findFirst({
        where: { workspaceId, email, ...OPEN },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      const record = open
        ? await prisma.invite.update({ where: { id: open.id }, data, select: inviteSelect })
        : await prisma.invite.create({
            data: { ...data, workspaceId, email },
            select: inviteSelect,
          });

      return { invite: toInvite(record), emailSent: await deliver(record, token) };
    },

    async resend(workspaceId, inviteId) {
      const token = newInviteToken();
      const { count } = await prisma.invite.updateMany({
        where: { id: inviteId, workspaceId, ...OPEN },
        data: { tokenHash: hashInviteToken(token), expiresAt: expiry() },
      });
      if (count === 0) throw inviteNotFound();
      const record = await prisma.invite.findUniqueOrThrow({
        where: { id: inviteId },
        select: inviteSelect,
      });
      return { invite: toInvite(record), emailSent: await deliver(record, token) };
    },

    async revoke(workspaceId, inviteId) {
      const { count } = await prisma.invite.updateMany({
        where: { id: inviteId, workspaceId, ...OPEN },
        data: { revokedAt: now() },
      });
      if (count === 0) throw inviteNotFound();
    },

    async preview(token) {
      const record = await prisma.invite.findUnique({
        where: { tokenHash: hashInviteToken(token) },
        select: inviteSelect,
      });
      if (!record) throw inviteNotFound();
      return {
        status: inviteStatus(record, now()),
        workspaceName: record.workspace.name,
        email: record.email,
        role: record.role,
        invitedBy: record.invitedBy?.name ?? null,
        expiresAt: record.expiresAt.toISOString(),
      };
    },

    async accept(token, userId) {
      const tokenHash = hashInviteToken(token);
      return prisma.$transaction(async (tx) => {
        // Locks the invite, so two tabs accepting at once cannot both use it.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM invites WHERE token_hash = ${tokenHash} FOR UPDATE
        `;
        const inviteId = locked[0]?.id;
        if (!inviteId) throw inviteNotFound();
        const record = await tx.invite.findUniqueOrThrow({
          where: { id: inviteId },
          select: inviteSelect,
        });
        const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Log in to continue');

        const membership = await tx.membership.findUnique({
          where: { userId_workspaceId: { userId, workspaceId: record.workspace.id } },
          select: { role: true },
        });
        const status = inviteStatus(record, now());
        if (status === 'accepted' && membership && user.email === record.email) {
          // Accepting twice (a double click, a second tab) just lands in the workspace.
          return { ...record.workspace, role: membership.role };
        }
        if (status !== 'pending') throw inviteUnavailable(status);
        if (user.email !== record.email) {
          throw new AppError(
            403,
            'FORBIDDEN',
            `This invite is for ${record.email}. Log in with that email to accept it.`,
          );
        }

        await tx.invite.update({ where: { id: record.id }, data: { acceptedAt: now() } });
        // Someone who is already a member keeps the role they have.
        const role =
          membership?.role ??
          (
            await tx.membership.create({
              data: { userId, workspaceId: record.workspace.id, role: record.role },
              select: { role: true },
            })
          ).role;
        return { ...record.workspace, role };
      });
    },
  };
}
