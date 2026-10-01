import { createHash } from 'node:crypto';
import {
  apiErrorSchema,
  invitePreviewSchema,
  invitesResponseSchema,
  meResponseSchema,
  sentInviteSchema,
  workspaceSummarySchema,
} from '@formyx/shared';
import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mailer } from '../lib/mailer.js';
import { createInviteService } from '../services/invite-service.js';
import { createFakeMailer, createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

const mailer = createFakeMailer();
const app = createTestApp({}, { mailer });
let team: Team;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
  mailer.sent.length = 0;
});

const as = (userId: string) => requestAs(app, userId);
const invitesPath = (suffix = '') => `/api/workspaces/${team.workspaceId}/invites${suffix}`;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The token in the most recent invite email's link. */
function lastInviteToken(): string {
  const text = mailer.sent.at(-1)?.messages[0]?.text ?? '';
  const match = /https:\/\/app\.formyx\.test\/invite\/([\w-]+)/.exec(text);
  if (!match?.[1]) throw new Error('No invite link was emailed');
  return match[1];
}

async function invite(email = 'ada@example.com', role = 'EDITOR') {
  const res = await as(team.users.OWNER).post(invitesPath(), { email, role }).expect(201);
  return { ...sentInviteSchema.parse(res.body), token: lastInviteToken() };
}

async function createUser(email: string) {
  const user = await prisma.user.create({ data: { name: 'Ada', email, passwordHash: 'x' } });
  return user.id;
}

const preview = (token: string) => request(app).get(`/api/invites/${token}`);
const accept = (token: string, userId: string) => as(userId).post(`/api/invites/${token}/accept`);

describe('sending invites', () => {
  it('emails a link that works for a week, storing only a hash of its token', async () => {
    const before = Date.now();
    const { invite: sent, emailSent, token } = await invite(' Ada@Example.com ', 'VIEWER');

    expect(emailSent).toBe(true);
    expect(sent).toMatchObject({ email: 'ada@example.com', role: 'VIEWER', invitedBy: 'OWNER' });
    const expiresIn = new Date(sent.expiresAt).getTime() - before;
    expect(expiresIn).toBeGreaterThanOrEqual(7 * DAY_MS - 1000);
    expect(expiresIn).toBeLessThanOrEqual(7 * DAY_MS + 5000);

    const [email] = mailer.sent.at(-1)?.messages ?? [];
    expect(email).toMatchObject({
      to: 'ada@example.com',
      subject: 'OWNER invited you to Team on Formyx',
    });
    expect(token).toMatch(/^[\w-]{43}$/);
    const stored = await prisma.invite.findFirstOrThrow();
    expect(stored.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('does not invite members, and replaces an open invite rather than adding one', async () => {
    const member = await as(team.users.OWNER)
      .post(invitesPath(), { email: 'viewer@example.com' })
      .expect(409);
    expect(apiErrorSchema.parse(member.body).error.code).toBe('CONFLICT');

    const first = await invite('ada@example.com', 'VIEWER');
    const second = await invite('ada@example.com', 'EDITOR');

    expect(second.invite.id).toBe(first.invite.id);
    const { invites } = invitesResponseSchema.parse(
      (await as(team.users.OWNER).get(invitesPath()).expect(200)).body,
    );
    expect(invites.map(({ email, role }) => ({ email, role }))).toEqual([
      { email: 'ada@example.com', role: 'EDITOR' },
    ]);
    // Only the newest link works.
    await preview(first.token).expect(404);
    await preview(second.token).expect(200);
  });

  it('keeps the invite when the email cannot be sent', async () => {
    const failing: Mailer = { send: vi.fn(() => Promise.reject(new Error('Resend is down'))) };
    const appWithBrokenEmail = createTestApp({}, { mailer: failing });

    const res = await requestAs(appWithBrokenEmail, team.users.OWNER)
      .post(invitesPath(), { email: 'ada@example.com' })
      .expect(201);

    expect(sentInviteSchema.parse(res.body).emailSent).toBe(false);
    expect(await prisma.invite.count()).toBe(1);
  });

  it('sends a fresh link again, and withdraws invites', async () => {
    const { invite: sent, token } = await invite();

    const again = await as(team.users.OWNER)
      .post(invitesPath(`/${sent.id}/resend`))
      .expect(200);
    expect(sentInviteSchema.parse(again.body).emailSent).toBe(true);
    const newToken = lastInviteToken();
    expect(newToken).not.toBe(token);
    await preview(token).expect(404);

    await as(team.users.OWNER)
      .delete(invitesPath(`/${sent.id}`))
      .expect(204);
    const revoked = invitePreviewSchema.parse((await preview(newToken).expect(200)).body);
    expect(revoked.status).toBe('revoked');
    const { invites } = invitesResponseSchema.parse(
      (await as(team.users.OWNER).get(invitesPath())).body,
    );
    expect(invites).toEqual([]);
    await as(team.users.OWNER)
      .delete(invitesPath(`/${sent.id}`))
      .expect(404);
  });
});

describe('accepting invites', () => {
  it('shows anyone with the link what it is for', async () => {
    const { token } = await invite('ada@example.com', 'VIEWER');

    const res = await preview(token).expect(200);

    expect(invitePreviewSchema.parse(res.body)).toMatchObject({
      status: 'pending',
      workspaceName: 'Team',
      email: 'ada@example.com',
      role: 'VIEWER',
      invitedBy: 'OWNER',
    });
    await preview('not-a-real-token').expect(404);
  });

  it('adds the invited person with the invited role, once', async () => {
    const { token } = await invite('ada@example.com', 'VIEWER');
    const ada = await createUser('ada@example.com');

    const res = await accept(token, ada).expect(200);

    expect(workspaceSummarySchema.parse(res.body)).toMatchObject({
      id: team.workspaceId,
      name: 'Team',
      role: 'VIEWER',
    });
    const me = meResponseSchema.parse((await as(ada).get('/api/auth/me')).body);
    expect(me.workspaces.map(({ id }) => id)).toEqual([team.workspaceId]);
    expect(invitePreviewSchema.parse((await preview(token)).body).status).toBe('accepted');

    // A second click lands in the workspace again; anyone else is turned away.
    await accept(token, ada).expect(200);
    const late = await accept(token, team.users.EDITOR).expect(410);
    expect(apiErrorSchema.parse(late.body).error).toMatchObject({
      code: 'INVITE_UNAVAILABLE',
      details: { status: 'accepted' },
    });
  });

  it('only lets the invited email accept', async () => {
    const { token } = await invite('ada@example.com');
    const eve = await createUser('eve@example.com');

    const res = await accept(token, eve).expect(403);

    expect(apiErrorSchema.parse(res.body).error.message).toBe(
      'This invite is for ada@example.com. Log in with that email to accept it.',
    );
    expect(await prisma.membership.count({ where: { userId: eve } })).toBe(0);
    await request(app).post(`/api/invites/${token}/accept`).expect(401);
  });

  it('works for someone who signs up after being invited', async () => {
    const { token } = await invite('new@example.com', 'EDITOR');
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ name: 'New Person', email: 'new@example.com', password: 'correct horse battery' })
      .expect(201);

    const res = await agent.post(`/api/invites/${token}/accept`).expect(200);

    expect(workspaceSummarySchema.parse(res.body).role).toBe('EDITOR');
  });

  it('keeps the role of someone who is already a member', async () => {
    const { token } = await invite('ada@example.com', 'OWNER');
    const ada = await createUser('ada@example.com');
    await prisma.membership.create({
      data: { userId: ada, workspaceId: team.workspaceId, role: 'VIEWER' },
    });

    const res = await accept(token, ada).expect(200);

    expect(workspaceSummarySchema.parse(res.body).role).toBe('VIEWER');
  });
});

describe('invite expiry', () => {
  it('stops working after seven days', async () => {
    const { invite: sent, token } = await invite('ada@example.com');
    const ada = await createUser('ada@example.com');
    await prisma.invite.update({
      where: { id: sent.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(invitePreviewSchema.parse((await preview(token)).body).status).toBe('expired');
    const res = await accept(token, ada).expect(410);
    expect(apiErrorSchema.parse(res.body).error).toMatchObject({
      code: 'INVITE_UNAVAILABLE',
      message: 'This invite has expired. Ask for a new one.',
      details: { status: 'expired' },
    });
    expect(await prisma.membership.count({ where: { userId: ada } })).toBe(0);

    // Expired invites stay listed, so owners can send them again.
    await as(team.users.OWNER)
      .post(invitesPath(`/${sent.id}/resend`))
      .expect(200);
    await accept(lastInviteToken(), ada).expect(200);
  });

  it('works until the last moment of its seventh day', async () => {
    const sentAt = new Date('2026-10-01T12:00:00.000Z');
    let now = sentAt;
    const invites = createInviteService({
      prisma,
      mailer,
      logger: pino({ level: 'silent' }),
      appUrl: 'https://app.formyx.test',
      now: () => now,
    });
    const { invite: sent } = await invites.send(team.workspaceId, team.users.OWNER, {
      email: 'ada@example.com',
      role: 'EDITOR',
    });
    const token = lastInviteToken();
    expect(sent.expiresAt).toBe('2026-10-08T12:00:00.000Z');

    now = new Date('2026-10-08T11:59:59.999Z');
    expect((await invites.preview(token)).status).toBe('pending');
    now = new Date('2026-10-08T12:00:00.000Z');
    expect((await invites.preview(token)).status).toBe('expired');
  });
});
