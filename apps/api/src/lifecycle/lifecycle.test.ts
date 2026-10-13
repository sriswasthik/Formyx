import {
  createDefaultAccountPreferences,
  createEmptyForm,
  createField,
  createDefaultTheme,
  formDetailSchema,
  type FormSchema,
} from '@formyx/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeMailer,
  startTestServer,
  TEST_JWT_SECRET,
  type TestServer,
} from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createSubmission } from '../test/responses.js';
import { createTeam, requestAs } from '../test/team.js';
import { createUnsubscribeToken, readUnsubscribeToken } from '../lib/unsubscribe-token.js';
import { queueInactiveEmails } from './lifecycle.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEMA: FormSchema = {
  ...createEmptyForm(),
  fields: [{ ...createField('short_text'), label: 'Name' }],
};

let server: TestServer;
let mailer: ReturnType<typeof createFakeMailer>;

beforeEach(async () => {
  await resetDatabase();
  mailer = createFakeMailer();
  server = await startTestServer({ mailer });
});

afterEach(async () => {
  await server.close();
});

/** Every lifecycle email sent so far, as one list. */
function sent() {
  return mailer.sent
    .filter(({ idempotencyKey }) => idempotencyKey.startsWith('lifecycle:'))
    .flatMap(({ messages, idempotencyKey }) =>
      messages.map((message) => ({ ...message, kind: idempotencyKey.split(':')[2] })),
    );
}

async function signUp(email = 'ada@example.com') {
  const agent = request.agent(server.app);
  const res = await agent
    .post('/api/auth/register')
    .send({ name: 'Ada Lovelace', email, password: 'correct horse battery' })
    .expect(201);
  const me = res.body as { user: { id: string }; workspaces: { id: string }[] };
  return { agent, userId: me.user.id, workspaceId: me.workspaces[0]?.id ?? '' };
}

async function createOwnForm(userId: string, workspaceId: string) {
  return prisma.form.create({
    data: {
      workspaceId,
      createdById: userId,
      title: 'Party RSVP',
      slug: `party-${String(Math.random()).slice(2, 10)}`,
      status: 'PUBLISHED',
      draftSchema: SCHEMA,
      publishedSchema: SCHEMA,
      publishedTitle: 'Party RSVP',
      publishedAt: new Date(),
      theme: createDefaultTheme(),
    },
  });
}

describe('lifecycle emails', () => {
  it('welcomes a new account once, with a one-click way to stop them', async () => {
    const { userId } = await signUp();
    await vi.waitFor(() => {
      expect(sent()).toHaveLength(1);
    });
    const [welcome] = sent();
    expect(welcome).toMatchObject({
      to: 'ada@example.com',
      subject: 'Welcome to Formyx',
      kind: 'welcome',
    });
    expect(welcome?.text).toContain('Welcome to Formyx, Ada');
    const token = /\/unsubscribe\/([\w.-]+)/.exec(welcome?.text ?? '')?.[1] ?? '';
    expect(readUnsubscribeToken(token, TEST_JWT_SECRET)).toBe(userId);
    expect(welcome?.headers?.['List-Unsubscribe']).toMatch(
      new RegExp(`^<https?://[^>]+/api/public/unsubscribe\\?token=${token}>$`),
    );
    expect(welcome?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(await prisma.lifecycleEmail.count({ where: { userId, kind: 'welcome' } })).toBe(1);
  });

  it('notes the first form published, once, however often forms are published', async () => {
    const { agent, workspaceId } = await signUp();
    const created = await agent
      .post(`/api/workspaces/${workspaceId}/forms`)
      .send({ templateId: 'feedback_survey' })
      .expect(201);
    let form = formDetailSchema.parse(created.body);
    for (let round = 0; round < 2; round++) {
      const published = await agent
        .post(`/api/forms/${form.id}/publish`)
        .send({ version: form.version })
        .expect(200);
      form = formDetailSchema.parse(published.body);
    }
    await vi.waitFor(() => {
      expect(sent().map((email) => email.kind)).toEqual(['welcome', 'first_form_published']);
    });
    const live = sent()[1];
    expect(live?.subject).toBe(`${form.title} is live`);
    expect(live?.text).toContain(`/f/${form.slug}`);
  });

  it('notes the first response to any of their forms, once, without its answers', async () => {
    const { userId, workspaceId } = await signUp();
    const form = await createOwnForm(userId, workspaceId);
    for (const name of ['Grace', 'Linus']) {
      await request(server.app)
        .post(`/api/public/forms/${form.slug}/submissions`)
        .send({ answers: { [SCHEMA.fields[0]?.id ?? '']: name } })
        .expect(201);
    }
    await vi.waitFor(() => {
      expect(sent().map((email) => email.kind)).toEqual(['welcome', 'first_response']);
    });
    const first = sent()[1];
    expect(first?.subject).toBe('Your first response to Party RSVP');
    expect(first?.text).toContain(`/app/forms/${form.id}/responses`);
    expect(first?.text).not.toContain('Grace');
  });

  it('sends no “first” emails to accounts from before onboarding', async () => {
    const team = await createTeam(prisma);
    const form = await createOwnForm(team.users.OWNER, team.workspaceId);
    server.events.emit('form.published', { formId: form.id, userId: team.users.OWNER });
    await createSubmission(prisma, form.id);
    await request(server.app)
      .post(`/api/public/forms/${form.slug}/submissions`)
      .send({ answers: {} })
      .expect(201);
    await server.jobs.drain();
    expect(sent()).toEqual([]);
  });

  it('sends nothing to someone who turned them off', async () => {
    const { userId, workspaceId } = await signUp();
    await vi.waitFor(() => {
      expect(sent()).toHaveLength(1);
    });
    await request(server.app)
      .post(`/api/public/unsubscribe?token=${createUnsubscribeToken(userId, TEST_JWT_SECRET)}`)
      .type('form')
      .send('List-Unsubscribe=One-Click')
      .expect(200, { productEmails: false });

    const form = await createOwnForm(userId, workspaceId);
    server.events.emit('form.published', { formId: form.id, userId });
    await new Promise((resolve) => setImmediate(resolve));
    await server.jobs.drain();
    expect(sent()).toHaveLength(1);
  });
});

describe('/api/public/unsubscribe and /resubscribe', () => {
  it('turn tips and reminders off and back on, from the token alone', async () => {
    const team = await createTeam(prisma);
    const token = createUnsubscribeToken(team.users.EDITOR, TEST_JWT_SECRET);
    const preferences = async () =>
      (await prisma.user.findUniqueOrThrow({ where: { id: team.users.EDITOR } })).preferences;

    await request(server.app)
      .post('/api/public/unsubscribe')
      .send({ token })
      .expect(200, { productEmails: false });
    expect(await preferences()).toEqual({
      ...createDefaultAccountPreferences(),
      productEmails: false,
    });
    await request(server.app)
      .post('/api/public/resubscribe')
      .send({ token })
      .expect(200, { productEmails: true });
    expect(await preferences()).toMatchObject({ productEmails: true });
  });

  it('refuses forged tokens, and never acts on a plain visit', async () => {
    const team = await createTeam(prisma);
    const forged = createUnsubscribeToken(
      team.users.EDITOR,
      'another-secret-of-at-least-32-chars!',
    );
    await request(server.app).post('/api/public/unsubscribe').send({ token: forged }).expect(400);
    await request(server.app)
      .get(
        `/api/public/unsubscribe?token=${createUnsubscribeToken(team.users.EDITOR, TEST_JWT_SECRET)}`,
      )
      .expect(404);
  });
});

describe('the two-week nudge', () => {
  // The job reads the real clock when it runs, so the test does too.
  const now = new Date();

  async function lastSeen(daysAgo: number, email: string) {
    return prisma.user.create({
      data: {
        name: 'Away',
        email,
        passwordHash: 'x',
        lastActiveAt: new Date(now.getTime() - daysAgo * DAY_MS),
      },
    });
  }

  it('goes to people away two to three weeks, once per stretch, with their new responses', async () => {
    const away = await lastSeen(15, 'away@example.com');
    await lastSeen(3, 'recent@example.com');
    await lastSeen(40, 'long-gone@example.com');
    const workspace = await prisma.workspace.create({ data: { name: 'W', slug: 'w-away' } });
    const form = await createOwnForm(away.id, workspace.id);
    await createSubmission(prisma, form.id);
    await createSubmission(prisma, form.id);

    expect(await queueInactiveEmails({ prisma, jobs: server.jobs }, now)).toBe(1);
    await vi.waitFor(() => {
      expect(sent()).toHaveLength(1);
    });
    expect(sent()[0]).toMatchObject({
      to: 'away@example.com',
      subject: 'New responses are waiting for you',
      kind: 'inactive',
    });
    expect(sent()[0]?.text).toContain('2 new responses have arrived since your last visit.');

    expect(await queueInactiveEmails({ prisma, jobs: server.jobs }, now)).toBe(0);
  });

  it('skips people who turned them off', async () => {
    const away = await lastSeen(15, 'away@example.com');
    await prisma.user.update({
      where: { id: away.id },
      data: { preferences: { ...createDefaultAccountPreferences(), productEmails: false } },
    });
    expect(await queueInactiveEmails({ prisma, jobs: server.jobs }, now)).toBe(0);
  });
});

describe('activity', () => {
  it('is noted when a signed-in request comes in', async () => {
    const team = await createTeam(prisma);
    await requestAs(server.app, team.users.OWNER).get('/api/auth/me').expect(200);
    await vi.waitFor(async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: team.users.OWNER } });
      expect(user.lastActiveAt).not.toBeNull();
    });
  });
});
