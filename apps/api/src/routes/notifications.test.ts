import {
  apiErrorSchema,
  createEmptyForm,
  createField,
  createOption,
  notificationSettingsSchema,
  submissionResponseSchema,
  type FormSchema,
} from '@formyx/shared';
import { pino } from 'pino';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeMailer,
  createTestApp,
  startTestServer,
  type TestServer,
} from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createPublishedForm } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

let team: Team;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

const yes = createOption('Yes');
const coming = { ...createField('single_choice'), label: 'Coming?', options: [yes] };
const name = { ...createField('short_text'), label: 'Name' };
const SCHEMA: FormSchema = { ...createEmptyForm(), fields: [name, coming] };

describe('/api/forms/:formId/notifications', () => {
  const app = createTestApp();
  const url = (formId: string) => `/api/forms/${formId}/notifications`;

  async function settings(userId: string, formId: string) {
    const res = await requestAs(app, userId).get(url(formId)).expect(200);
    return notificationSettingsSchema.parse(res.body);
  }

  it('is off until a member turns it on, for themselves only', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    expect(await settings(team.users.VIEWER, form.id)).toEqual({ emailOnSubmission: false });

    const res = await requestAs(app, team.users.VIEWER)
      .put(url(form.id), { emailOnSubmission: true })
      .expect(200);

    expect(notificationSettingsSchema.parse(res.body)).toEqual({ emailOnSubmission: true });
    expect(await settings(team.users.VIEWER, form.id)).toEqual({ emailOnSubmission: true });
    expect(await settings(team.users.EDITOR, form.id)).toEqual({ emailOnSubmission: false });
  });

  it('turns off again, and turning it on twice is fine', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const owner = requestAs(app, team.users.OWNER);

    await owner.put(url(form.id), { emailOnSubmission: true }).expect(200);
    await owner.put(url(form.id), { emailOnSubmission: true }).expect(200);
    await owner.put(url(form.id), { emailOnSubmission: false }).expect(200);

    expect(await settings(team.users.OWNER, form.id)).toEqual({ emailOnSubmission: false });
  });

  it('checks the body and who is asking', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const stranger = await prisma.user.create({
      data: { name: 'Eve', email: 'eve@example.com', passwordHash: 'x' },
    });

    const invalid = await requestAs(app, team.users.OWNER)
      .put(url(form.id), { emailOnSubmission: 'yes' })
      .expect(400);
    expect(apiErrorSchema.parse(invalid.body).error.code).toBe('VALIDATION_ERROR');
    await requestAs(app, stranger.id).get(url(form.id)).expect(403);
    await request(app).get(url(form.id)).expect(401);
  });
});

describe('emails about new responses', () => {
  let server: TestServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  async function subscribe(userId: string, formId: string) {
    await prisma.formSubscription.create({ data: { userId, formId } });
  }

  async function respond(slug: string, answers: Record<string, unknown>) {
    if (!server) throw new Error('Start the server first');
    const res = await request(server.app)
      .post(`/api/public/forms/${slug}/submissions`)
      .send({ answers })
      .expect(201);
    return submissionResponseSchema.parse(res.body).id;
  }

  it('emails subscribed members once the response is saved', async () => {
    const mailer = createFakeMailer();
    server = await startTestServer({ mailer });
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA, 'Party <RSVP>');
    await subscribe(team.users.EDITOR, form.id);
    await subscribe(team.users.VIEWER, form.id);

    const id = await respond(form.slug, { [name.id]: 'Ada <b>', [coming.id]: yes.id });

    await vi.waitFor(() => {
      expect(mailer.send).toHaveBeenCalledTimes(1);
    });
    const [call] = mailer.sent;
    const link = `https://app.formyx.test/app/forms/${form.id}/responses?tab=responses&response=${id}`;
    expect(call?.idempotencyKey).toBe(`submission-created/${id}`);
    expect(call?.messages.map((message) => message.to).sort()).toEqual([
      'editor@example.com',
      'viewer@example.com',
    ]);
    expect(call?.messages[0]).toMatchObject({ subject: 'New response to Party <RSVP>' });
    expect(call?.messages[0]?.html).toContain('Ada &lt;b&gt;');
    expect(call?.messages[0]?.html).toContain(link.replaceAll('&', '&amp;'));
    expect(call?.messages[0]?.text).toContain(link);
    expect(call?.messages[0]?.text).toContain('Coming?\nYes');
  });

  it('does not email members who left the workspace, or anyone when nobody asked', async () => {
    const mailer = createFakeMailer();
    server = await startTestServer({ mailer });
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await subscribe(team.users.OWNER, form.id);
    await prisma.membership.delete({
      where: { userId_workspaceId: { userId: team.users.OWNER, workspaceId: team.workspaceId } },
    });

    await respond(form.slug, { [name.id]: 'Ada' });
    // Give the listener time to run: it looks up recipients after the reply.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('still takes the response when email fails, and logs the failure', async () => {
    const logs: { msg: string; formId?: string }[] = [];
    const logger = pino(
      { level: 'error' },
      {
        write: (line: string) => {
          logs.push(JSON.parse(line) as { msg: string; formId?: string });
        },
      },
    );
    const mailer = { send: vi.fn(() => Promise.reject(new Error('Resend is down'))) };
    server = await startTestServer({ mailer, logger });
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await subscribe(team.users.EDITOR, form.id);

    await respond(form.slug, { [name.id]: 'Ada' });

    await vi.waitFor(() => {
      expect(logs).toContainEqual(
        expect.objectContaining({ msg: 'Could not send new response emails', formId: form.id }),
      );
    });
    expect(await prisma.submission.count({ where: { formId: form.id } })).toBe(1);
  });
});
