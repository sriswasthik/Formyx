import bcrypt from 'bcrypt';
import {
  accountDeletionSchema,
  adminDataRequestsSchema,
  apiErrorSchema,
  createEmptyForm,
  createField,
  dataExportSchema,
  dataExportsSchema,
  meResponseSchema,
  respondentLookupResponseSchema,
  type FormSchema,
} from '@formyx/shared';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBillingService } from '../billing/billing-service.js';
import { createRazorpayClient } from '../billing/razorpay.js';
import { parseEnv } from '../config/env.js';
import { readZip } from '../lib/zip.js';
import { createAccountDeletionService } from '../privacy/account-deletion.js';
import { subjectHash } from '../privacy/data-request-log.js';
import {
  createFakeMailer,
  startTestServer,
  TEST_JWT_SECRET,
  type TestServer,
} from '../test/create-test-app.js';
import { resetDatabase, testDatabaseUrl, testPrisma as prisma } from '../test/database.js';
import { startFakeRazorpay } from '../test/fake-razorpay.js';
import { createPublishedForm } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

const PASSWORD = 'correct horse battery staple';
const DAY_MS = 24 * 60 * 60 * 1000;

const razorpay = await startFakeRazorpay();
const mailer = createFakeMailer();
let server: TestServer;
beforeAll(async () => {
  server = await startTestServer({ mailer, autoRunJobs: false, env: razorpay.env });
});
afterAll(async () => {
  await server.close();
  await razorpay.close();
});

let team: Team;
beforeEach(async () => {
  await resetDatabase();
  razorpay.reset();
  mailer.sent.length = 0;
  team = await createTeam(prisma);
  // The owner can confirm with a password.
  await prisma.user.update({
    where: { id: team.users.OWNER },
    data: { passwordHash: await bcrypt.hash(PASSWORD, 4) },
  });
});

const as = (userId: string) => requestAs(server.app, userId);
const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

const email = { ...createField('email'), label: 'Email' };
const name = { ...createField('short_text'), label: 'Name' };
const SCHEMA: FormSchema = { ...createEmptyForm(), fields: [name, email] };

async function respond(formId: string, answers: Record<string, string>, respondentEmail?: string) {
  return prisma.submission.create({
    data: { formId, answers, metadata: {}, respondentEmail: respondentEmail ?? null },
    select: { id: true },
  });
}

describe('exporting my data', () => {
  it('makes a ZIP of my account, workspaces, forms and responses, and emails me', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA, 'Feedback');
    await respond(form.id, { [name.id]: 'Ada', [email.id]: 'ada@example.com' });

    const started = dataExportSchema.parse(
      (await as(team.users.OWNER).post('/api/account/exports').expect(202)).body,
    );
    expect(started.status).toBe('PENDING');
    await server.jobs.drain();

    const { exports } = dataExportsSchema.parse(
      (await as(team.users.OWNER).get('/api/account/exports').expect(200)).body,
    );
    expect(exports[0]).toMatchObject({ id: started.id, status: 'READY' });
    const download = await as(team.users.OWNER)
      .get(`/api/account/exports/${started.id}/download`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      })
      .expect(200);
    expect(download.headers['content-type']).toBe('application/zip');
    expect(download.headers['cache-control']).toBe('no-store');

    const files = readZip(download.body as Buffer);
    const text = (path: string) => files.get(path)?.toString('utf8') ?? '';
    expect([...files.keys()]).toEqual([
      'README.txt',
      'account.json',
      'workspaces.json',
      `forms/${form.slug}/form.json`,
      `forms/${form.slug}/responses.json`,
      `forms/${form.slug}/responses.csv`,
    ]);
    expect(JSON.parse(text('account.json'))).toMatchObject({ email: 'owner@example.com' });
    expect(JSON.parse(text('workspaces.json'))).toEqual([
      expect.objectContaining({
        name: 'Team',
        role: 'OWNER',
        members: expect.arrayContaining([
          { name: 'EDITOR', email: 'editor@example.com', role: 'EDITOR' },
        ]) as unknown,
      }),
    ]);
    expect(JSON.parse(text(`forms/${form.slug}/form.json`))).toMatchObject({ title: 'Feedback' });
    expect(text(`forms/${form.slug}/form.json`)).not.toContain('passwordHash');
    expect(text(`forms/${form.slug}/responses.csv`)).toContain('ada@example.com');
    expect(JSON.parse(text(`forms/${form.slug}/responses.json`))).toHaveLength(1);

    expect(mailer.sent.at(-1)?.messages[0]).toMatchObject({
      to: 'owner@example.com',
      subject: 'Your Formyx data is ready',
    });
    const log = await prisma.dataRequest.findFirstOrThrow({ where: { kind: 'ACCOUNT_EXPORT' } });
    expect(log).toMatchObject({ status: 'DONE', userId: team.users.OWNER });
  });

  it('leaves out forms of workspaces I am only a member of', async () => {
    await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await as(team.users.EDITOR).post('/api/account/exports').expect(202);
    await server.jobs.drain();
    const row = await prisma.dataExport.findFirstOrThrow({ where: { userId: team.users.EDITOR } });

    const files = readZip(Buffer.from(row.archive ?? new Uint8Array()));
    expect([...files.keys()].some((path) => path.startsWith('forms/'))).toBe(false);
  });

  it('is only downloaded by its owner, and only for a week', async () => {
    const started = dataExportSchema.parse(
      (await as(team.users.OWNER).post('/api/account/exports').expect(202)).body,
    );
    await server.jobs.drain();
    const url = `/api/account/exports/${started.id}/download`;

    await as(team.users.EDITOR).get(url).expect(404);
    await request(server.app).get(url).expect(401);
    await prisma.dataExport.update({
      where: { id: started.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(errorCode((await as(team.users.OWNER).get(url).expect(410)).body)).toBe(
      'EXPORT_EXPIRED',
    );
  });

  it('is asked for at most three times a day', async () => {
    for (let index = 0; index < 3; index += 1) {
      await as(team.users.OWNER).post('/api/account/exports').expect(202);
      await server.jobs.drain();
    }
    const res = await as(team.users.OWNER).post('/api/account/exports').expect(429);
    expect(errorCode(res.body)).toBe('RATE_LIMITED');
  });
});

describe('a respondent’s request', () => {
  const path = (query = '') => `/api/workspaces/${team.workspaceId}/respondent-data${query}`;

  it('finds their responses by the address they gave, or answered with', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA, 'Feedback');
    const asked = await respond(form.id, { [name.id]: 'Ada' }, 'Ada@Example.com');
    const answered = await respond(form.id, { [email.id]: ' ADA@example.com ' });
    await respond(form.id, { [email.id]: 'grace@example.com' });
    const elsewhere = await prisma.workspace.create({ data: { name: 'Other', slug: 'other' } });
    const theirs = await createPublishedForm(prisma, elsewhere.id, SCHEMA);
    await respond(theirs.id, { [email.id]: 'ada@example.com' });

    const found = respondentLookupResponseSchema.parse(
      (await as(team.users.EDITOR).get(path('?email=ada%40example.com')).expect(200)).body,
    );

    expect(found.total).toBe(2);
    expect(found.matches.map((match) => [match.submissionId, match.matchedBy]).sort()).toEqual(
      [
        [asked.id, 'respondent_email'],
        [answered.id, 'answer'],
      ].sort(),
    );
  });

  it('deletes them all, and logs it without the address', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await respond(form.id, { [email.id]: 'ada@example.com' });
    await respond(form.id, { [email.id]: 'ada@example.com' });
    const kept = await respond(form.id, { [email.id]: 'grace@example.com' });

    const res = await as(team.users.EDITOR)
      .post(path('/delete'), { email: 'ada@example.com' })
      .expect(200);

    expect(res.body).toEqual({ deleted: 2 });
    expect((await prisma.submission.findMany()).map(({ id }) => id)).toEqual([kept.id]);
    const log = await prisma.dataRequest.findFirstOrThrow({
      where: { kind: 'RESPONDENT_DELETION' },
    });
    expect(log).toMatchObject({
      status: 'DONE',
      workspaceId: team.workspaceId,
      subjectHash: subjectHash('ada@example.com'),
      details: { responses: 2 },
    });
    expect(JSON.stringify(log)).not.toContain('ada@example.com');
  });

  it('is for editors and owners of the workspace', async () => {
    await as(team.users.VIEWER).get(path('?email=ada%40example.com')).expect(403);
    await as(team.users.VIEWER).post(path('/delete'), { email: 'ada@example.com' }).expect(403);
    await as(team.users.EDITOR).get(path('?email=not-an-address')).expect(400);
  });
});

describe('deleting my account', () => {
  const billingEnv = () =>
    parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: TEST_JWT_SECRET,
      APP_URL: 'https://app.formyx.test',
      ...razorpay.env,
    });
  const deletion = (now: Date) =>
    createAccountDeletionService({
      prisma,
      billing: createBillingService({
        prisma,
        env: billingEnv(),
        razorpay: createRazorpayClient(billingEnv()),
      }),
      mailer: createFakeMailer(),
      logger: pino({ level: 'silent' }),
      appUrl: 'https://app.formyx.test',
      now: () => now,
    });

  it('asks what happens to shared workspaces only I own', async () => {
    const plan = accountDeletionSchema.parse(
      (await as(team.users.OWNER).get('/api/account/deletion').expect(200)).body,
    );
    expect(plan.scheduledFor).toBeNull();
    expect(plan.workspaces).toEqual([
      expect.objectContaining({ id: team.workspaceId, fate: 'choose', paidPlan: false }),
    ]);

    const res = await as(team.users.OWNER)
      .post('/api/account/delete', { password: PASSWORD })
      .expect(400);
    expect(errorCode(res.body)).toBe('VALIDATION_ERROR');
    await as(team.users.OWNER)
      .post('/api/account/delete', {
        password: PASSWORD,
        workspaces: [{ workspaceId: team.workspaceId, action: 'transfer', toUserId: 'nobody' }],
      })
      .expect(400);
    await as(team.users.OWNER)
      .post('/api/account/delete', { password: 'wrong password!!', workspaces: [] })
      .expect(400);
  });

  it('waits a week, signed out, then hands the workspace over and deletes the rest', async () => {
    const solo = await prisma.workspace.create({ data: { name: 'Mine', slug: 'mine' } });
    await prisma.membership.create({
      data: { userId: team.users.OWNER, workspaceId: solo.id, role: 'OWNER' },
    });
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await prisma.form.update({ where: { id: form.id }, data: { createdById: team.users.OWNER } });

    const res = await as(team.users.OWNER)
      .post('/api/account/delete', {
        password: PASSWORD,
        workspaces: [
          { workspaceId: team.workspaceId, action: 'transfer', toUserId: team.users.EDITOR },
        ],
      })
      .expect(202);
    expect(res.headers['set-cookie']?.[0]).toMatch(/formyx_session=;/);
    const { scheduledFor } = res.body as { scheduledFor: string };
    // The old session no longer works; the account is still there.
    await as(team.users.OWNER).get('/api/auth/me').expect(401);
    expect(await prisma.user.count({ where: { id: team.users.OWNER } })).toBe(1);
    expect(mailer.sent.at(-1)?.messages[0]?.subject).toBe('Your Formyx account will be deleted');

    // Nothing happens before the week is up.
    expect(await deletion(new Date(Date.now() + 6 * DAY_MS)).runDue()).toBe(0);
    expect(await deletion(new Date(new Date(scheduledFor).getTime() + 1000)).runDue()).toBe(1);

    expect(await prisma.user.findUnique({ where: { id: team.users.OWNER } })).toBeNull();
    expect(await prisma.workspace.findUnique({ where: { id: solo.id } })).toBeNull();
    const heir = await prisma.membership.findUniqueOrThrow({
      where: { userId_workspaceId: { userId: team.users.EDITOR, workspaceId: team.workspaceId } },
    });
    expect(heir.role).toBe('OWNER');
    expect((await prisma.form.findUniqueOrThrow({ where: { id: form.id } })).createdById).toBe(
      team.users.EDITOR,
    );
    const log = await prisma.dataRequest.findFirstOrThrow({
      where: { kind: 'ACCOUNT_DELETION' },
    });
    expect(log).toMatchObject({
      status: 'DONE',
      userId: null,
      details: expect.objectContaining({
        workspacesDeleted: 1,
        workspacesTransferred: 1,
      }) as unknown,
    });
  });

  it('is undone from the emailed link, or by signing in and keeping it', async () => {
    await as(team.users.OWNER)
      .post('/api/account/delete', {
        password: PASSWORD,
        workspaces: [{ workspaceId: team.workspaceId, action: 'delete' }],
      })
      .expect(202);
    const text = mailer.sent.at(-1)?.messages[0]?.text ?? '';
    const token = decodeURIComponent(/token=([^\s]+)/.exec(text)?.[1] ?? '');

    await request(server.app).post('/api/public/account/restore').send({ token }).expect(204);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: team.users.OWNER } }))
        .deletionScheduledFor,
    ).toBeNull();
    // A used link does nothing more.
    await request(server.app).post('/api/public/account/restore').send({ token }).expect(404);

    // Asking again, then signing in during the week: the account says so, and can be kept.
    const signIn = async () => {
      const login = await request(server.app)
        .post('/api/auth/login')
        .send({ email: 'owner@example.com', password: PASSWORD })
        .expect(200);
      const cookie: string[] = ([] as string[]).concat(login.headers['set-cookie'] ?? []);
      return { body: login.body as unknown, cookie };
    };
    const first = await signIn();
    await request(server.app)
      .post('/api/account/delete')
      .set('Cookie', first.cookie)
      .send({
        password: PASSWORD,
        workspaces: [{ workspaceId: team.workspaceId, action: 'delete' }],
      })
      .expect(202);
    const again = await signIn();
    expect(meResponseSchema.parse(again.body).user.deletionScheduledFor).toEqual(
      expect.any(String),
    );
    await request(server.app).post('/api/account/restore').set('Cookie', again.cookie).expect(204);
    expect(await deletion(new Date(Date.now() + 8 * DAY_MS)).runDue()).toBe(0);
    expect(await prisma.workspace.count()).toBe(1);
    const logs = await prisma.dataRequest.findMany({ where: { kind: 'ACCOUNT_DELETION' } });
    expect(logs.map(({ status }) => status)).toEqual(['CANCELLED', 'CANCELLED']);
  });

  it('cancels the plan of a workspace it deletes, and keeps everything if it can’t', async () => {
    razorpay.subscriptions.set('sub_team', {
      id: 'sub_team',
      plan_id: 'plan_promonthly',
      status: 'active',
      total_count: 120,
    });
    await prisma.subscription.create({
      data: {
        workspaceId: team.workspaceId,
        razorpaySubscriptionId: 'sub_team',
        plan: 'PRO',
        interval: 'MONTHLY',
        status: 'ACTIVE',
        createdById: team.users.OWNER,
      },
    });
    await as(team.users.OWNER)
      .post('/api/account/delete', {
        password: PASSWORD,
        workspaces: [{ workspaceId: team.workspaceId, action: 'delete' }],
      })
      .expect(202);
    const later = deletion(new Date(Date.now() + 8 * DAY_MS));

    razorpay.fail(500);
    expect(await later.runDue()).toBe(0);
    expect(await prisma.workspace.count()).toBe(1);

    expect(await later.runDue()).toBe(1);
    expect(razorpay.subscriptions.get('sub_team')?.status).toBe('cancelled');
    expect(await prisma.workspace.count()).toBe(0);
  });
});

describe('the admin data request log', () => {
  it('lists requests for admins only', async () => {
    const admin = await prisma.user.create({
      data: { name: 'Admin', email: 'admin@formyx.test', passwordHash: 'x', isAdmin: true },
    });
    await as(team.users.EDITOR)
      .get(`/api/workspaces/${team.workspaceId}/respondent-data?email=ada%40example.com`)
      .expect(200);

    const { requests } = adminDataRequestsSchema.parse(
      (await as(admin.id).get('/api/admin/data-requests').expect(200)).body,
    );
    expect(requests).toEqual([
      expect.objectContaining({
        kind: 'RESPONDENT_LOOKUP',
        status: 'DONE',
        requester: { id: team.users.EDITOR, email: 'editor@example.com' },
        details: { responses: 0 },
      }),
    ]);
    await as(team.users.OWNER).get('/api/admin/data-requests').expect(403);
  });
});
