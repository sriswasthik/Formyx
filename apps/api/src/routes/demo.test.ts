import {
  apiErrorSchema,
  createEmptyForm,
  createField,
  formDetailSchema,
  meResponseSchema,
  type FormSchema,
} from '@formyx/shared';
import request, { type Response } from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_EMAIL, DEMO_WORKSPACE_NAME, resetDemo, type DemoAccount } from '../demo/demo-seed.js';
import { SESSION_COOKIE } from '../lib/session.js';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createFakeCloudinary } from '../test/fake-cloudinary.js';
import { createPublishedForm } from '../test/responses.js';
import { requestAs } from '../test/team.js';

const cloud = createFakeCloudinary();
const app = createTestApp({ DEMO_ENABLED: 'true' }, { storage: cloud.storage });
const appWithoutDemo = createTestApp();

beforeEach(async () => {
  await resetDatabase();
});

function expectRestricted(res: Response) {
  expect(res.status).toBe(403);
  expect(apiErrorSchema.parse(res.body).error.code).toBe('DEMO_RESTRICTED');
}

describe('POST /api/auth/demo', () => {
  it('signs in to the demo account, setting it up on the first visit', async () => {
    const res = await request(app).post('/api/auth/demo').expect(200);

    const me = meResponseSchema.parse(res.body);
    expect(me.user).toMatchObject({ email: DEMO_EMAIL, isDemo: true });
    expect(me.workspaces).toEqual([expect.objectContaining({ name: DEMO_WORKSPACE_NAME })]);
    expect(res.get('Set-Cookie')?.[0]).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(await prisma.form.count()).toBe(3);

    // Everyone shares the one account.
    const again = meResponseSchema.parse((await request(app).post('/api/auth/demo')).body);
    expect(again.user.id).toBe(me.user.id);
  });

  it('is not there unless the server turns it on', async () => {
    const res = await request(appWithoutDemo).post('/api/auth/demo').expect(404);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    expect(await prisma.user.count()).toBe(0);
  });

  it('cannot be reached with a password', async () => {
    await resetDemo(prisma);
    await request(app)
      .post('/api/auth/login')
      .send({ email: DEMO_EMAIL, password: '!demo-account-has-no-password' })
      .expect(401);
  });

  it('says which accounts are not the demo', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct horse' })
      .expect(201);
    expect(meResponseSchema.parse(res.body).user.isDemo).toBe(false);
  });
});

describe('the demo account', () => {
  let demo: DemoAccount;
  let as: ReturnType<typeof requestAs>;
  let formId: string;

  beforeEach(async () => {
    demo = await resetDemo(prisma);
    as = requestAs(app, demo.userId);
    const form = await prisma.form.findFirstOrThrow({ where: { workspaceId: demo.workspaceId } });
    formId = form.id;
  });

  it('can build forms and look at responses like anyone else', async () => {
    const form = formDetailSchema.parse((await as.get(`/api/forms/${formId}`).expect(200)).body);
    await as
      .patch(`/api/forms/${formId}`, { version: form.version, title: 'My experiment' })
      .expect(200);
    await as.get(`/api/forms/${formId}/submissions`).expect(200);
    await as.post(`/api/workspaces/${demo.workspaceId}/forms`, { templateId: 'blank' }).expect(201);
  });

  it('cannot change the workspace or who is in it', async () => {
    const ws = `/api/workspaces/${demo.workspaceId}`;
    expectRestricted(await as.post('/api/workspaces', { name: 'Mine' }));
    expectRestricted(await as.patch(ws, { name: 'Renamed' }));
    expectRestricted(await as.delete(ws));
    expectRestricted(await as.patch(`${ws}/members/${demo.userId}`, { role: 'EDITOR' }));
    expectRestricted(await as.delete(`${ws}/members/${demo.userId}`));
    expectRestricted(await as.post('/api/invites/some-token/accept'));

    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: demo.workspaceId } });
    expect(workspace.name).toBe(DEMO_WORKSPACE_NAME);
  });

  it('cannot send emails or requests outside Formyx', async () => {
    const ws = `/api/workspaces/${demo.workspaceId}`;
    expectRestricted(
      await as.post(`${ws}/invites`, { email: 'friend@example.com', role: 'EDITOR' }),
    );
    expectRestricted(
      await as.put(`/api/forms/${formId}/notifications`, { emailOnSubmission: true }),
    );
    expectRestricted(
      await as.post(`/api/forms/${formId}/webhooks`, { url: 'https://hooks.example.com/formyx' }),
    );
    expect(await prisma.invite.count()).toBe(0);
    expect(await prisma.webhook.count()).toBe(0);
    expect(await prisma.formSubscription.count()).toBe(0);
  });

  it('cannot upload images, and its forms do not take files', async () => {
    expectRestricted(
      await as.get(`/api/uploads/signature?purpose=logo&formId=${encodeURIComponent(formId)}`),
    );

    const cv = { ...createField('file'), label: 'Your CV' };
    const schema: FormSchema = { ...createEmptyForm(), fields: [cv] };
    const withFiles = await createPublishedForm(prisma, demo.workspaceId, schema);
    const signature = `/api/uploads/signature?purpose=answer&form=${withFiles.slug}&field=${cv.id}`;
    expectRestricted(await request(app).get(signature));
  });
});
