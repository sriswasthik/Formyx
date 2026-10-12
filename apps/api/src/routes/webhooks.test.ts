import {
  apiErrorSchema,
  createdWebhookSchema,
  createEmptyForm,
  createField,
  createOption,
  MAX_WEBHOOKS_PER_FORM,
  WEBHOOK_LOG_SIZE,
  webhookDeliveriesSchema,
  webhookDeliverySchema,
  webhooksResponseSchema,
  type FormSchema,
  type WebhookPayload,
} from '@formyx/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JOB_POLICIES } from '../jobs/job-types.js';
import { verifyWebhookSignature } from '../lib/webhook-signature.js';
import { createTestApp, startTestServer, type TestServer } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createPublishedForm } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';
import { closedPort, startWebhookReceiver } from '../test/webhook-receiver.js';

const app = createTestApp();
let team: Team;
const cleanups: (() => Promise<void>)[] = [];

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const yes = createOption('Yes');
const name = { ...createField('short_text'), label: 'Name' };
const coming = { ...createField('single_choice'), label: 'Coming?', options: [yes] };
const SCHEMA: FormSchema = { ...createEmptyForm(), fields: [name, coming] };

async function receiver(respond?: (index: number) => number) {
  const started = await startWebhookReceiver(respond);
  cleanups.push(started.close);
  return started;
}

const editor = () => requestAs(app, team.users.EDITOR);
const hooksPath = (formId: string, suffix = '') => `/api/forms/${formId}/webhooks${suffix}`;

async function addWebhook(formId: string, url: string, target = app) {
  const res = await requestAs(target, team.users.EDITOR)
    .post(hooksPath(formId), { url })
    .expect(201);
  return createdWebhookSchema.parse(res.body);
}

function parsePayload(body: string): WebhookPayload {
  return JSON.parse(body) as WebhookPayload;
}

describe('managing webhooks', () => {
  it('adds a webhook and shows its secret once, stored only encrypted', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);

    const { webhook, secret } = await addWebhook(form.id, 'https://hooks.example.com/formyx');

    expect(secret).toMatch(/^whsec_[\w-]{43}$/);
    expect(webhook).toMatchObject({ url: 'https://hooks.example.com/formyx', lastDelivery: null });
    const listed = webhooksResponseSchema.parse(
      (await editor().get(hooksPath(form.id)).expect(200)).body,
    );
    expect(listed.webhooks.map(({ id }) => id)).toEqual([webhook.id]);
    expect(JSON.stringify(listed)).not.toContain(secret);
    const stored = await prisma.webhook.findUniqueOrThrow({ where: { id: webhook.id } });
    expect(stored.secretEncrypted).not.toContain(secret);
  });

  it('refuses plain http and private addresses outside development', async () => {
    const strict = createTestApp({ WEBHOOK_ALLOW_PRIVATE_URLS: 'false' });
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);

    for (const url of [
      'http://hooks.example.com/formyx',
      'https://localhost/hook',
      'https://192.168.1.10/hook',
      'https://169.254.169.254/latest/meta-data',
    ]) {
      const res = await requestAs(strict, team.users.EDITOR)
        .post(hooksPath(form.id), { url })
        .expect(400);
      expect(apiErrorSchema.parse(res.body).error.details).toEqual([
        { path: 'url', message: expect.any(String) as string },
      ]);
    }
    expect(await prisma.webhook.count()).toBe(0);
  });

  it(`allows ${MAX_WEBHOOKS_PER_FORM} webhooks per form`, async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    for (let index = 0; index < MAX_WEBHOOKS_PER_FORM; index++) {
      await addWebhook(form.id, `https://hooks.example.com/${index}`);
    }

    const res = await editor()
      .post(hooksPath(form.id), { url: 'https://hooks.example.com/one-more' })
      .expect(409);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('CONFLICT');
  });

  it('removes a webhook with its log, and keeps each form’s webhooks to itself', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const other = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const target = await receiver();
    const { webhook } = await addWebhook(form.id, target.url);
    await editor()
      .post(hooksPath(form.id, `/${webhook.id}/test`))
      .expect(200);

    await editor()
      .get(hooksPath(other.id, `/${webhook.id}/deliveries`))
      .expect(404);
    await editor()
      .delete(hooksPath(other.id, `/${webhook.id}`))
      .expect(404);
    await editor()
      .delete(hooksPath(form.id, `/${webhook.id}`))
      .expect(204);

    expect(await prisma.webhook.count()).toBe(0);
    expect(await prisma.webhookDelivery.count()).toBe(0);
  });
});

describe('test events', () => {
  it('sends a signed test event at once, with example answers, and logs it', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA, 'Party');
    const target = await receiver();
    const { webhook, secret } = await addWebhook(form.id, target.url);

    const res = await editor()
      .post(hooksPath(form.id, `/${webhook.id}/test`))
      .expect(200);

    expect(webhookDeliverySchema.parse(res.body)).toMatchObject({
      event: 'test',
      attempt: 1,
      succeeded: true,
      statusCode: 200,
      error: null,
    });
    const [received] = target.requests;
    if (!received) throw new Error('Nothing was received');
    expect(received.headers).toMatchObject({
      'content-type': 'application/json',
      'x-formyx-event': 'test',
      'user-agent': 'Formyx-Webhooks/1.0',
    });
    const signature = String(received.headers['x-formyx-signature']);
    expect(verifyWebhookSignature(received.body, secret, signature)).toBe(true);
    const payload = parsePayload(received.body);
    expect(received.headers['x-formyx-delivery']).toBe(payload.id);
    expect(payload).toMatchObject({ event: 'test', form: { id: form.id, title: 'Party' } });
    expect(payload.submission.answers).toEqual([
      {
        fieldId: name.id,
        label: 'Name',
        type: 'short_text',
        value: 'Example answer',
        text: 'Example answer',
      },
      { fieldId: coming.id, label: 'Coming?', type: 'single_choice', value: yes.id, text: 'Yes' },
    ]);

    const { deliveries } = webhookDeliveriesSchema.parse(
      (
        await editor()
          .get(hooksPath(form.id, `/${webhook.id}/deliveries`))
          .expect(200)
      ).body,
    );
    expect(deliveries).toHaveLength(1);
    const { webhooks } = webhooksResponseSchema.parse(
      (await editor().get(hooksPath(form.id))).body,
    );
    expect(webhooks[0]?.lastDelivery?.succeeded).toBe(true);
  });

  it('logs why a delivery failed without a response', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const { webhook } = await addWebhook(form.id, `http://127.0.0.1:${await closedPort()}/hook`);

    const res = await editor()
      .post(hooksPath(form.id, `/${webhook.id}/test`))
      .expect(200);

    expect(webhookDeliverySchema.parse(res.body)).toMatchObject({
      succeeded: false,
      statusCode: null,
      error: 'Connection refused',
    });
  });

  it(`keeps the newest ${WEBHOOK_LOG_SIZE} deliveries of each webhook`, async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const target = await receiver((index) => (index % 2 === 0 ? 200 : 500));
    const { webhook } = await addWebhook(form.id, target.url);

    for (let index = 0; index < WEBHOOK_LOG_SIZE + 5; index++) {
      await editor()
        .post(hooksPath(form.id, `/${webhook.id}/test`))
        .expect(200);
    }

    const { deliveries } = webhookDeliveriesSchema.parse(
      (await editor().get(hooksPath(form.id, `/${webhook.id}/deliveries`))).body,
    );
    expect(deliveries).toHaveLength(WEBHOOK_LOG_SIZE);
    expect(await prisma.webhookDelivery.count()).toBe(WEBHOOK_LOG_SIZE);
    // Newest first: the last test event (index 24) got a 200.
    expect(deliveries[0]?.statusCode).toBe(200);
  });
});

describe('delivering new responses', () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
    cleanups.push(() => server.close());
  });

  async function submitTo(slug: string) {
    await request(server.url)
      .post(`/api/public/forms/${slug}/submissions`)
      .send({ answers: { [name.id]: 'Ada', [coming.id]: yes.id } })
      .expect(201);
  }

  it('posts each new response to every webhook of the form, signed with its own secret', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA, 'Party');
    const first = await receiver();
    const second = await receiver();
    const a = await addWebhook(form.id, first.url, server.app);
    const b = await addWebhook(form.id, second.url, server.app);

    await submitTo(form.slug);

    await vi.waitFor(() => {
      expect(first.requests).toHaveLength(1);
      expect(second.requests).toHaveLength(1);
    });
    await server.jobs.drain();
    for (const [received, secret] of [
      [first.requests[0], a.secret],
      [second.requests[0], b.secret],
    ] as const) {
      if (!received) throw new Error('Nothing was received');
      expect(
        verifyWebhookSignature(
          received.body,
          secret,
          String(received.headers['x-formyx-signature']),
        ),
      ).toBe(true);
      const payload = parsePayload(received.body);
      expect(payload.event).toBe('submission.created');
      expect(payload.form).toEqual({ id: form.id, title: 'Party' });
      expect(payload.submission.answers.map(({ label, text }) => ({ label, text }))).toEqual([
        { label: 'Name', text: 'Ada' },
        { label: 'Coming?', text: 'Yes' },
      ]);
    }
  });

  it('retries failures with backoff, sending the same signed event each time', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const target = await receiver((index) => (index < 2 ? 500 : 200));
    const { webhook } = await addWebhook(form.id, target.url, server.app);

    await submitTo(form.slug);

    await vi.waitFor(() => {
      expect(target.requests).toHaveLength(3);
    });
    await server.jobs.drain();
    const [firstTry, ...retries] = target.requests;
    for (const retry of retries) {
      expect(retry.body).toBe(firstTry?.body);
      expect(retry.headers['x-formyx-delivery']).toBe(firstTry?.headers['x-formyx-delivery']);
      expect(retry.headers['x-formyx-signature']).toBe(firstTry?.headers['x-formyx-signature']);
    }
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId: webhook.id },
      orderBy: { attempt: 'asc' },
    });
    expect(
      deliveries.map(({ attempt, statusCode, succeeded }) => ({ attempt, statusCode, succeeded })),
    ).toEqual([
      { attempt: 1, statusCode: 500, succeeded: false },
      { attempt: 2, statusCode: 500, succeeded: false },
      { attempt: 3, statusCode: 200, succeeded: true },
    ]);
  });

  it('gives up after its last try, and lists the failure on the form', async () => {
    const tries = JOB_POLICIES['webhook.deliver'].attempts;
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const target = await receiver(() => 503);
    const { webhook } = await addWebhook(form.id, target.url, server.app);

    await submitTo(form.slug);

    await vi.waitFor(() => {
      expect(target.requests).toHaveLength(tries);
    });
    await server.jobs.drain();
    expect(target.requests).toHaveLength(tries);
    expect(await prisma.webhookDelivery.count({ where: { succeeded: false } })).toBe(tries);
    const failures = await prisma.jobFailure.findMany({ where: { formId: form.id } });
    expect(failures).toEqual([
      expect.objectContaining({
        queue: 'webhook.deliver',
        webhookId: webhook.id,
        attempts: tries,
        error: 'The webhook answered 503',
        resolvedAt: null,
      }),
    ]);
  });

  it('drops queued deliveries to a webhook that was removed meanwhile', async () => {
    // Jobs wait for drain(), so the webhook can go between queueing and sending.
    const manual = await startTestServer({ autoRunJobs: false });
    cleanups.push(() => manual.close());
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const target = await receiver(() => 500);
    const { webhook } = await addWebhook(form.id, target.url, manual.app);

    await request(manual.url)
      .post(`/api/public/forms/${form.slug}/submissions`)
      .send({ answers: { [name.id]: 'Ada' } })
      .expect(201);
    await vi.waitFor(() => {
      expect(manual.jobs.pending()).toBe(1);
    });
    await requestAs(manual.app, team.users.EDITOR)
      .delete(hooksPath(form.id, `/${webhook.id}`))
      .expect(204);
    await manual.jobs.drain();

    expect(target.requests).toHaveLength(0);
    expect(await prisma.jobFailure.count()).toBe(0);
  });
});
