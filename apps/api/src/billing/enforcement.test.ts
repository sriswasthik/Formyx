import {
  createDefaultLiveSettings,
  createDefaultTheme,
  createEmptyForm,
  createField,
  meResponseSchema,
  publicFormResponseSchema,
  type FormSchema,
} from '@formyx/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptionFromEnv } from '../lib/encryption.js';
import { RESPONSE_LIMIT_MESSAGE } from '../services/public-form-service.js';
import {
  createFakeMailer,
  createTestApp,
  startTestServer,
  TEST_JWT_SECRET,
  type TestServer,
} from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createPublishedForm, createSubmission } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

/*
 * What plans change in practice, with ENTITLEMENTS_MODE=enforced: new workspaces' trials, how
 * a form looks and runs on Free (nothing deleted, Pro looks swapped, Pro work paused), the
 * monthly response limit and its warnings.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const email = { ...createField('email'), label: 'Email' };
const SCHEMA: FormSchema = { ...createEmptyForm(), fields: [email] };
const ENFORCED = { ENTITLEMENTS_MODE: 'enforced' };

let team: Team;
let server: TestServer | undefined;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});
afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** The running test server's app. */
function serverApp() {
  if (!server) throw new Error('Start the server first');
  return server.app;
}

const setPlan = (data: Parameters<typeof prisma.workspace.update>[0]['data']) =>
  prisma.workspace.update({ where: { id: team.workspaceId }, data });

describe('trials', () => {
  const register = (app: ReturnType<typeof createTestApp>, address: string) =>
    request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada Lovelace', email: address, password: 'correct horse battery' })
      .expect(201);

  it('start with the first workspace, one per account', async () => {
    const app = createTestApp(ENFORCED);
    const me = meResponseSchema.parse((await register(app, 'ada@example.com')).body);
    const first = await prisma.workspace.findUniqueOrThrow({
      where: { id: me.workspaces[0]?.id ?? '' },
    });
    expect(first).toMatchObject({ plan: 'PRO', planStatus: 'TRIALING' });
    const days = ((first.trialEndsAt?.getTime() ?? 0) - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);

    // A second workspace: no second trial.
    const res = await requestAs(app, me.user.id)
      .post('/api/workspaces', { name: 'Side project' })
      .expect(201);
    const second = await prisma.workspace.findUniqueOrThrow({
      where: { id: (res.body as { id: string }).id },
    });
    expect(second).toMatchObject({ plan: 'FREE', planStatus: 'ACTIVE', trialEndsAt: null });
  });

  it('give an account that never had one a trial on its first workspace of its own', async () => {
    const app = createTestApp(ENFORCED);
    // Invited into someone else's workspace, never made one.
    const res = await requestAs(app, team.users.EDITOR)
      .post('/api/workspaces', { name: 'Mine' })
      .expect(201);
    const made = await prisma.workspace.findUniqueOrThrow({
      where: { id: (res.body as { id: string }).id },
    });
    expect(made.planStatus).toBe('TRIALING');
  });

  it('don’t start while everything is unlocked', async () => {
    const app = createTestApp();
    const me = meResponseSchema.parse((await register(app, 'bo@example.com')).body);
    const made = await prisma.workspace.findUniqueOrThrow({
      where: { id: me.workspaces[0]?.id ?? '' },
    });
    expect(made).toMatchObject({ plan: 'FREE', trialEndsAt: null });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: me.user.id } })).trialUsedAt,
    ).toBeNull();
  });
});

describe('a published form on Free', () => {
  async function proForm() {
    const theme = createDefaultTheme();
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await prisma.form.update({
      where: { id: form.id },
      data: {
        publishedTheme: {
          ...theme,
          typography: { ...theme.typography, headingFont: 'fraunces' },
          branding: { ...theme.branding, showFormyxBadge: false },
        },
      },
    });
    return form;
  }
  const load = async (app: ReturnType<typeof createTestApp>, slug: string) =>
    publicFormResponseSchema.parse(
      (await request(app).get(`/api/public/forms/${slug}`).expect(200)).body,
    );

  it('is drawn with the closest free looks, and its saved theme is kept', async () => {
    const form = await proForm();
    const shown = await load(createTestApp(ENFORCED), form.slug);
    if (shown.status !== 'open') throw new Error('Not open');
    expect(shown.theme.typography.headingFont).toBe('lora');
    expect(shown.theme.branding.showFormyxBadge).toBe(true);

    const stored = await prisma.form.findUniqueOrThrow({ where: { id: form.id } });
    expect(stored.publishedTheme).toMatchObject({ typography: { headingFont: 'fraunces' } });
  });

  it('looks as designed on Pro, and with everything unlocked', async () => {
    const form = await proForm();
    await setPlan({ plan: 'PRO', planStatus: 'ACTIVE' });
    for (const app of [createTestApp(ENFORCED), createTestApp()]) {
      const shown = await load(app, form.slug);
      if (shown.status !== 'open') throw new Error('Not open');
      expect(shown.theme.typography.headingFont).toBe('fraunces');
    }
  });

  it('looks as designed again during a complimentary plan', async () => {
    const form = await proForm();
    await setPlan({ complimentaryPlan: 'PRO', complimentaryUntil: new Date(Date.now() + DAY_MS) });
    const shown = await load(createTestApp(ENFORCED), form.slug);
    if (shown.status !== 'open') throw new Error('Not open');
    expect(shown.theme.typography.headingFont).toBe('fraunces');
  });
});

describe('the monthly response limit', () => {
  async function fullForm() {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    // Free allows 100 a month.
    await prisma.submission.createMany({
      data: Array.from({ length: 100 }, () => ({ formId: form.id, answers: {}, metadata: {} })),
    });
    return form;
  }

  it('soft: new visitors can still respond', async () => {
    const form = await fullForm();
    const app = createTestApp({ ...ENFORCED, ENFORCEMENT_MODE: 'soft' });
    const shown = publicFormResponseSchema.parse(
      (await request(app).get(`/api/public/forms/${form.slug}`)).body,
    );
    expect(shown.status).toBe('open');
  });

  it('hard: new visitors are told, and responses already being filled in are still saved', async () => {
    const form = await fullForm();
    const app = createTestApp({ ...ENFORCED, ENFORCEMENT_MODE: 'hard' });
    const shown = publicFormResponseSchema.parse(
      (await request(app).get(`/api/public/forms/${form.slug}`)).body,
    );
    expect(shown).toMatchObject({ status: 'closed', message: RESPONSE_LIMIT_MESSAGE });

    await request(app)
      .post(`/api/public/forms/${form.slug}/submissions`)
      .send({ answers: { [email.id]: 'late@example.com' } })
      .expect(201);
    expect(await prisma.submission.count()).toBe(101);
  });

  it('hard: counts the current month only, and no limit on Business', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    for (let i = 0; i < 3; i += 1) {
      await createSubmission(prisma, form.id, { createdAt: new Date(Date.now() - 40 * DAY_MS) });
    }
    const app = createTestApp({ ...ENFORCED, ENFORCEMENT_MODE: 'hard' });
    const shown = publicFormResponseSchema.parse(
      (await request(app).get(`/api/public/forms/${form.slug}`)).body,
    );
    expect(shown.status).toBe('open');

    await setPlan({ plan: 'BUSINESS', planStatus: 'ACTIVE' });
    const full = await fullForm();
    const business = publicFormResponseSchema.parse(
      (await request(app).get(`/api/public/forms/${full.slug}`)).body,
    );
    expect(business.status).toBe('open');
  });

  it('warns the owners at 80% and at 100%, once each', async () => {
    const mailer = createFakeMailer();
    server = await startTestServer({ mailer, env: ENFORCED });
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await prisma.submission.createMany({
      data: Array.from({ length: 79 }, () => ({ formId: form.id, answers: {}, metadata: {} })),
    });
    const respond = () =>
      request(serverApp())
        .post(`/api/public/forms/${form.slug}/submissions`)
        .send({ answers: { [email.id]: 'r@example.com' } })
        .expect(201);
    const subjects = () =>
      mailer.sent.flatMap(({ messages }) => messages.map((message) => message.subject));

    await respond();
    await vi.waitFor(() => {
      expect(subjects()).toEqual(['Your forms have used 80% of this month’s responses']);
    });
    await respond();
    await prisma.submission.createMany({
      data: Array.from({ length: 18 }, () => ({ formId: form.id, answers: {}, metadata: {} })),
    });
    await respond();
    await vi.waitFor(() => {
      expect(subjects()).toEqual([
        'Your forms have used 80% of this month’s responses',
        'Your forms have reached this month’s response limit',
      ]);
    });
    expect(mailer.sent[1]?.messages[0]?.to).toBe('owner@example.com');
  });
});

describe('work a plan pays for, on Free', () => {
  async function busyForm() {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const settings = createDefaultLiveSettings();
    await prisma.form.update({
      where: { id: form.id },
      data: {
        liveSettings: {
          ...settings,
          autoresponder: { ...settings.autoresponder, enabled: true, recipientFieldId: email.id },
          notifications: { ...settings.notifications, emails: ['extra@example.com'] },
        },
        slackWebhookEncrypted: encryptionFromEnv({ JWT_SECRET: TEST_JWT_SECRET }).encrypt(
          'https://hooks.slack.com/services/T000/B000/abcdef123456',
        ),
      },
    });
    return form;
  }

  async function respondTo(slug: string) {
    await request(serverApp())
      .post(`/api/public/forms/${slug}/submissions`)
      .send({ answers: { [email.id]: 'respondent@example.com' } })
      .expect(201);
    // The listeners run after the reply.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await server?.jobs.drain();
  }

  it('pauses: no autoresponder, no extra addresses, no chat posts', async () => {
    const mailer = createFakeMailer();
    server = await startTestServer({ mailer, env: ENFORCED });
    const form = await busyForm();
    await prisma.formSubscription.create({ data: { userId: team.users.OWNER, formId: form.id } });

    await respondTo(form.slug);
    const recipients = mailer.sent.flatMap(({ messages }) => messages.map((message) => message.to));
    expect(recipients).toEqual(['owner@example.com']);
    expect(server.jobs.sent.filter(({ name }) => name === 'chat.post')).toEqual([]);
  });

  it('runs again on a paid plan, with the same settings', async () => {
    const mailer = createFakeMailer();
    server = await startTestServer({ mailer, env: ENFORCED });
    await setPlan({ plan: 'PRO', planStatus: 'ACTIVE' });
    const form = await busyForm();
    await prisma.formSubscription.create({ data: { userId: team.users.OWNER, formId: form.id } });

    await respondTo(form.slug);
    const recipients = mailer.sent.flatMap(({ messages }) => messages.map((message) => message.to));
    expect(recipients.sort()).toEqual([
      'extra@example.com',
      'owner@example.com',
      'respondent@example.com',
    ]);
    expect(server.jobs.sent.filter(({ name }) => name === 'chat.post')).toHaveLength(1);
  });

  it('keeps a custom link image for paid plans only', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await prisma.form.update({
      where: { id: form.id },
      data: {
        liveSettings: {
          sharing: { socialImageUrl: 'https://res.cloudinary.com/x/image/upload/og.png' },
        },
      },
    });
    const meta = async () =>
      (
        await request(createTestApp(ENFORCED))
          .get(`/api/public/forms/${form.slug}/meta`)
          .expect(200)
      ).body as { imageUrl?: string };
    expect((await meta()).imageUrl).not.toContain('cloudinary');
    await setPlan({ plan: 'PRO', planStatus: 'ACTIVE' });
    expect((await meta()).imageUrl).toBe('https://res.cloudinary.com/x/image/upload/og.png');
  });
});
