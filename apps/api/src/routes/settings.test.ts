import {
  apiErrorSchema,
  createDefaultLiveSettings,
  createEmptyForm,
  createField,
  formMetaSchema,
  formSettingsViewSchema,
  submissionResponseSchema,
  type FormSchema,
  type LiveSettings,
} from '@formyx/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeChatTransport,
  createFakeMailer,
  createTestApp,
  startTestServer,
  type TestServer,
} from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createPublishedForm } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

// A form's live settings: saving them, what they need of the plan, and what they set off
// when responses arrive (emails, chat posts, the autoresponder), plus the Data section.

const SLACK = 'https://hooks.slack.com/services/T000/B000/abcdefgh1234';
const DISCORD =
  'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-123';

const name = { ...createField('short_text'), id: 'name', label: 'Your name', required: true };
const contact = { ...createField('email'), id: 'contact', label: 'Email' };
const SCHEMA: FormSchema = {
  ...createEmptyForm(),
  description: 'Tell us how it went',
  fields: [name, contact],
};
const defaults = createDefaultLiveSettings();

let team: Team;
let server: TestServer | null = null;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

afterEach(async () => {
  await server?.close();
  server = null;
});

const settingsUrl = (formId: string) => `/api/forms/${formId}/settings`;

async function setSettings(formId: string, settings: Partial<LiveSettings>) {
  await prisma.form.update({
    where: { id: formId },
    data: { liveSettings: { ...defaults, ...settings } },
  });
}

describe('saving settings', () => {
  const chat = createFakeChatTransport();
  const app = createTestApp({}, { chat });
  const editor = () => requestAs(app, team.users.EDITOR);

  it('starts from the defaults, and replaces only the sections sent', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const initial = formSettingsViewSchema.parse(
      (await editor().get(settingsUrl(form.id)).expect(200)).body,
    );
    expect(initial).toMatchObject({
      settings: defaults,
      hasPassword: false,
      chat: { slack: null, discord: null },
    });

    const access = { ...defaults.access, requireEmail: true, responseLimit: 50 };
    const saved = formSettingsViewSchema.parse(
      (await editor().patch(settingsUrl(form.id), { access }).expect(200)).body,
    );
    expect(saved.settings).toEqual({ ...defaults, access });
  });

  it('is for editors to change; viewers may read', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const viewer = requestAs(app, team.users.VIEWER);
    await viewer.get(settingsUrl(form.id)).expect(200);
    await viewer.patch(settingsUrl(form.id), { access: defaults.access }).expect(403);
    await viewer.put(`/api/forms/${form.id}/slug`, { slug: 'mine' }).expect(403);
  });

  it('needs somewhere to send the autoresponder', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const autoresponder = { ...defaults.autoresponder, enabled: true };

    const nowhere = await editor().patch(settingsUrl(form.id), { autoresponder }).expect(422);
    expect(apiErrorSchema.parse(nowhere.body).error.details).toEqual([
      expect.objectContaining({ path: 'autoresponder.recipientFieldId' }),
    ]);
    const notEmail = await editor()
      .patch(settingsUrl(form.id), {
        autoresponder: { ...autoresponder, recipientFieldId: 'name' },
      })
      .expect(422);
    expect(apiErrorSchema.parse(notEmail.body).error.details).toEqual([
      { path: 'autoresponder.recipientFieldId', message: 'Choose an email question' },
    ]);
    await editor()
      .patch(settingsUrl(form.id), {
        autoresponder: { ...autoresponder, recipientFieldId: 'contact' },
      })
      .expect(200);
    await editor()
      .patch(settingsUrl(form.id), {
        access: { ...defaults.access, requireEmail: true },
        autoresponder,
      })
      .expect(200);
  });

  it('takes Slack and Discord incoming webhooks only, and shows just their ends', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const refused = await editor()
      .put(`${settingsUrl(form.id)}/chat`, { service: 'slack', url: 'https://example.com/hook' })
      .expect(400);
    expect(apiErrorSchema.parse(refused.body).error.code).toBe('VALIDATION_ERROR');

    await editor()
      .put(`${settingsUrl(form.id)}/chat`, { service: 'slack', url: SLACK })
      .expect(200);
    const view = await editor().get(settingsUrl(form.id)).expect(200);
    expect(formSettingsViewSchema.parse(view.body).chat).toEqual({
      slack: { hint: '…1234' },
      discord: null,
    });
    expect(JSON.stringify(view.body)).not.toContain('hooks.slack.com');
    // Stored encrypted, never as given.
    const stored = await prisma.form.findUniqueOrThrow({ where: { id: form.id } });
    expect(stored.slackWebhookEncrypted).not.toContain('hooks.slack.com');

    await editor()
      .post(`${settingsUrl(form.id)}/chat/test`, { service: 'slack' })
      .expect(204);
    expect(chat.posts.at(-1)?.url).toBe(SLACK);
    expect(chat.posts.at(-1)?.body).toContain('Customer survey');

    await editor()
      .put(`${settingsUrl(form.id)}/chat`, { service: 'slack', url: null })
      .expect(200);
    await editor()
      .post(`${settingsUrl(form.id)}/chat/test`, { service: 'slack' })
      .expect(409);
  });

  it('keeps the demo account from emailing anyone', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await prisma.user.update({ where: { id: team.users.EDITOR }, data: { isDemo: true } });
    const res = await editor()
      .patch(settingsUrl(form.id), {
        notifications: { ...defaults.notifications, emails: ['someone@example.com'] },
      })
      .expect(403);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('DEMO_RESTRICTED');
    await editor()
      .put(`${settingsUrl(form.id)}/chat`, { service: 'discord', url: DISCORD })
      .expect(403);
  });
});

describe('plans', () => {
  const app = createTestApp({ ENTITLEMENTS_MODE: 'enforced' });
  const editor = () => requestAs(app, team.users.EDITOR);

  it('needs Pro to turn on Pro settings, but never to turn things off', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const pro = await editor()
      .patch(settingsUrl(form.id), { access: { ...defaults.access, oneResponsePer: 'email' } })
      .expect(403);
    expect(apiErrorSchema.parse(pro.body)).toMatchObject({
      error: { code: 'UPGRADE_REQUIRED', details: { features: ['verified_responses'] } },
    });
    await editor()
      .put(`${settingsUrl(form.id)}/chat`, { service: 'slack', url: SLACK })
      .expect(403);
    await editor().get(`/api/forms/${form.id}/submissions/export.xlsx`).expect(403);

    // Free: passwords, schedules, limits, one per browser, edits, data.
    await editor()
      .patch(settingsUrl(form.id), {
        access: {
          ...defaults.access,
          oneResponsePer: 'browser',
          allowEdits: true,
          responseLimit: 9,
        },
        data: { retentionDays: 30 },
      })
      .expect(200);
    await editor()
      .put(`${settingsUrl(form.id)}/password`, { password: 'free-1' })
      .expect(200);
  });
});

describe('when responses arrive', () => {
  async function respond(slug: string, body: object) {
    if (!server) throw new Error('Start the server first');
    const res = await request(server.app)
      .post(`/api/public/forms/${slug}/submissions`)
      .send(body)
      .expect(201);
    return submissionResponseSchema.parse(res.body);
  }

  it('emails the extra addresses too, once each', async () => {
    const mailer = createFakeMailer();
    server = await startTestServer({ mailer });
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await prisma.formSubscription.create({ data: { userId: team.users.EDITOR, formId: form.id } });
    await setSettings(form.id, {
      notifications: {
        ...defaults.notifications,
        emails: ['team@example.com', 'EDITOR@example.com'],
      },
    });

    await respond(form.slug, { answers: { name: 'Ada' } });
    await vi.waitFor(() => {
      expect(mailer.send).toHaveBeenCalled();
    });
    expect(mailer.sent[0]?.messages.map(({ to }) => to).sort()).toEqual([
      'editor@example.com',
      'team@example.com',
    ]);
  });

  it('sends no email per response when the form asks for a daily digest', async () => {
    const mailer = createFakeMailer();
    server = await startTestServer({ mailer });
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await prisma.formSubscription.create({ data: { userId: team.users.EDITOR, formId: form.id } });
    await setSettings(form.id, {
      notifications: { ...defaults.notifications, frequency: 'daily' },
    });

    await respond(form.slug, { answers: { name: 'Ada' } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('posts to Slack and Discord, escaping answers and pinging nobody', async () => {
    const chat = createFakeChatTransport();
    server = await startTestServer({ chat });
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const app = server.app;
    const editor = requestAs(app, team.users.EDITOR);
    await editor.put(`${settingsUrl(form.id)}/chat`, { service: 'slack', url: SLACK }).expect(200);
    await editor
      .put(`${settingsUrl(form.id)}/chat`, { service: 'discord', url: DISCORD })
      .expect(200);

    await respond(form.slug, { answers: { name: '<@everyone> & co' } });
    await vi.waitFor(() => {
      expect(chat.posts).toHaveLength(2);
    });
    const slack = chat.posts.find((post) => post.url === SLACK);
    const discord = chat.posts.find((post) => post.url === DISCORD);
    expect(slack?.body).toContain('&lt;@everyone&gt; &amp; co');
    expect(JSON.parse(discord?.body ?? '{}')).toMatchObject({ allowed_mentions: { parse: [] } });
  });

  describe('the autoresponder', () => {
    const autoresponder = {
      ...defaults.autoresponder,
      enabled: true,
      recipientFieldId: 'contact',
      subject: 'Thanks, {{field:name}}',
      replyTo: 'hello@example.com',
    };

    it('emails the respondent their answers, with the edit link when the form gives one', async () => {
      const mailer = createFakeMailer();
      server = await startTestServer({ mailer });
      const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
      await setSettings(form.id, {
        autoresponder,
        access: { ...defaults.access, allowEdits: true },
      });

      const { editToken } = await respond(form.slug, {
        answers: { name: 'Ada', contact: 'ada@example.com' },
      });
      await vi.waitFor(() => {
        expect(mailer.send).toHaveBeenCalled();
      });
      const message = mailer.sent[0]?.messages[0];
      expect(message).toMatchObject({
        to: 'ada@example.com',
        subject: 'Thanks, Ada',
        replyTo: 'hello@example.com',
      });
      expect(message?.text).toContain('Your name\nAda');
      expect(message?.text).toContain(`#edit=${editToken ?? ''}`);
    });

    it('sends one address only a few a day from one form', async () => {
      const mailer = createFakeMailer();
      server = await startTestServer({ mailer });
      const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
      await setSettings(form.id, { autoresponder });

      for (let response = 0; response < 4; response += 1) {
        await respond(form.slug, { answers: { name: 'Ada', contact: 'victim@example.com' } });
      }
      await vi.waitFor(() => {
        expect(mailer.send).toHaveBeenCalledTimes(3);
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mailer.send).toHaveBeenCalledTimes(3);
    });

    it('sends nothing when it is off, or without an address', async () => {
      const mailer = createFakeMailer();
      server = await startTestServer({ mailer });
      const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
      await respond(form.slug, { answers: { name: 'Ada', contact: 'ada@example.com' } });
      await setSettings(form.id, { autoresponder });
      await respond(form.slug, { answers: { name: 'Ada' } });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mailer.send).not.toHaveBeenCalled();
    });
  });
});

describe('data', () => {
  const app = createTestApp();
  const editor = () => requestAs(app, team.users.EDITOR);

  async function withResponses(count: number) {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA, 'Big survey');
    for (let index = 0; index < count; index += 1) {
      await prisma.submission.create({
        data: { formId: form.id, answers: { name: `Person ${index}` }, metadata: {} },
      });
    }
    return form;
  }

  it('deletes every response once the title is typed out', async () => {
    const form = await withResponses(3);
    const wrong = await editor()
      .post(`/api/forms/${form.id}/submissions/delete-all`, { confirm: 'big' })
      .expect(400);
    expect(apiErrorSchema.parse(wrong.body).error.code).toBe('VALIDATION_ERROR');
    await requestAs(app, team.users.VIEWER)
      .post(`/api/forms/${form.id}/submissions/delete-all`, { confirm: 'Big survey' })
      .expect(403);

    const res = await editor()
      .post(`/api/forms/${form.id}/submissions/delete-all`, { confirm: 'Big survey' })
      .expect(200);
    expect(res.body).toEqual({ deleted: 3 });
    expect(await prisma.submission.count({ where: { formId: form.id } })).toBe(0);
  });

  it('downloads an Excel workbook', async () => {
    const form = await withResponses(2);
    const res = await requestAs(app, team.users.VIEWER)
      .get(`/api/forms/${form.id}/submissions/export.xlsx`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          callback(null, Buffer.concat(chunks));
        });
      })
      .expect(200);
    expect(res.headers['content-disposition']).toMatch(/big-survey-responses-.*\.xlsx/);
    // An .xlsx file is a zip archive.
    expect(Buffer.isBuffer(res.body) && res.body.subarray(0, 2).toString()).toBe('PK');
  });
});

describe('link previews', () => {
  const app = createTestApp();

  it('describes a published form for link previews and search engines', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA, 'Workshop');
    const meta = formMetaSchema.parse(
      (await request(app).get(`/api/public/forms/${form.slug}/meta`).expect(200)).body,
    );
    expect(meta).toMatchObject({
      slug: form.slug,
      title: 'Workshop',
      description: 'Tell us how it went',
      indexable: false,
    });
    expect(meta.imageUrl).toMatch(new RegExp(`/api/public/forms/${form.slug}/og\\.png\\?v=\\d+$`));

    await setSettings(form.id, {
      access: { ...defaults.access, unlisted: false },
      sharing: { socialTitle: 'Join the workshop', faviconUrl: 'https://example.com/icon.png' },
    });
    const custom = formMetaSchema.parse(
      (await request(app).get(`/api/public/forms/${form.slug}/meta`).expect(200)).body,
    );
    expect(custom).toMatchObject({
      title: 'Join the workshop',
      faviconUrl: 'https://example.com/icon.png',
      indexable: true,
    });
  });

  it("draws a preview image in the form's colours, or sends people to its own", async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA, 'Workshop');
    const res = await request(app)
      .get(`/api/public/forms/${form.slug}/og.png`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          callback(null, Buffer.concat(chunks));
        });
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(Buffer.isBuffer(res.body) && res.body.subarray(1, 4).toString()).toBe('PNG');

    await setSettings(form.id, { sharing: { socialImageUrl: 'https://example.com/card.png' } });
    const custom = await request(app).get(`/api/public/forms/${form.slug}/og.png`).expect(302);
    expect(custom.headers.location).toBe('https://example.com/card.png');
  }, 20_000);

  it('says nothing about forms that were never published', async () => {
    const created = await requestAs(app, team.users.EDITOR)
      .post(`/api/workspaces/${team.workspaceId}/forms`, {})
      .expect(201);
    const { slug } = created.body as { slug: string };
    await request(app).get(`/api/public/forms/${slug}/meta`).expect(404);
  });
});
