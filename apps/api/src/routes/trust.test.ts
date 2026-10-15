import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  adminFormReviewSchema,
  adminReviewQueueSchema,
  apiErrorSchema,
  createEmptyForm,
  createField,
  formDetailSchema,
  meResponseSchema,
  NEW_ACCOUNT_LIMITS,
  publicFormResponseSchema,
  validationIssueSchema,
  type FormDetail,
  type FormSchema,
} from '@formyx/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFakeMailer, createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createTeam, requestAs, type Team } from '../test/team.js';
import { REPORTS_TO_HOLD } from '../trust/report-service.js';

/*
 * Sprint 21's trust and safety, through the API: phishing checks on publishing, reports, the
 * admin review queue and suspensions, new accounts' limits, disposable sign-ups, email
 * verification, unsafe webhooks and the Turnstile spam check.
 */

/** Cloudflare's siteverify, faked: the token "pass" passes. */
let turnstile: Server;
let turnstileUrl = '';

beforeAll(async () => {
  turnstile = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: params.get('response') === 'pass' }));
    });
  });
  await new Promise<void>((resolve) => turnstile.listen(0, '127.0.0.1', resolve));
  turnstileUrl = `http://127.0.0.1:${String((turnstile.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    turnstile.close(() => {
      resolve();
    });
  });
});

// Reports count people by address: behind a proxy, so tests can be several people.
const app = createTestApp({ TRUST_PROXY: 'true', TURNSTILE_URL: 'http://placeholder.test' });
let team: Team;
let adminId: string;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
  const admin = await prisma.user.create({
    data: {
      name: 'Admin',
      email: 'admin@example.com',
      passwordHash: 'x',
      isAdmin: true,
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
  });
  adminId = admin.id;
});

const editor = () => requestAs(app, team.users.EDITOR);
const admin = () => requestAs(app, adminId);

/** A form with one required question asking `label`. */
function asking(label: string, extra: Partial<FormSchema> = {}): FormSchema {
  return {
    ...createEmptyForm(),
    fields: [{ ...createField('short_text'), label, required: true }],
    ...extra,
  };
}

async function draft(schema: FormSchema, as = editor()): Promise<FormDetail> {
  const created = await as
    .post(`/api/workspaces/${team.workspaceId}/forms`, { title: 'Survey' })
    .expect(201);
  const { id } = formDetailSchema.parse(created.body);
  const res = await as.patch(`/api/forms/${id}`, { version: 1, draftSchema: schema }).expect(200);
  return formDetailSchema.parse(res.body);
}

async function publish(form: Pick<FormDetail, 'id' | 'version'>, as = editor()) {
  const res = await as.post(`/api/forms/${form.id}/publish`, { version: form.version }).expect(200);
  return formDetailSchema.parse(res.body);
}

async function edit(form: FormDetail, schema: FormSchema): Promise<FormDetail> {
  const res = await editor()
    .patch(`/api/forms/${form.id}`, { version: form.version, draftSchema: schema })
    .expect(200);
  return formDetailSchema.parse(res.body);
}

const publicForm = async (slug: string) =>
  publicFormResponseSchema.parse((await request(app).get(`/api/public/forms/${slug}`)).body);

const answerFor = (form: FormDetail) => ({ [form.draftSchema.fields[0]?.id ?? '']: 'Ada' });

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe('publishing a form that phishes', () => {
  it('holds it for review instead, and says why', async () => {
    const held = await publish(await draft(asking('Enter your net banking password')));
    expect(held.status).toBe('UNDER_REVIEW');
    expect(held.review?.reasons).toEqual(['asks for a password', 'mentions net banking']);
  });

  it('keeps a held form from everyone: no page, no preview, no responses', async () => {
    const held = await publish(await draft(asking('Your OTP')));
    expect(await publicForm(held.slug)).toEqual(
      expect.objectContaining({ status: 'unavailable', slug: held.slug }),
    );
    // Not even the title.
    expect(JSON.stringify(await publicForm(held.slug))).not.toContain('Survey');
    await request(app).get(`/api/public/forms/${held.slug}/meta`).expect(404);
    const submit = await request(app)
      .post(`/api/public/forms/${held.slug}/submissions`)
      .send({ answers: answerFor(held) })
      .expect(410);
    expect(errorCode(submit.body)).toBe('FORM_UNAVAILABLE');
  });

  it('lets an ordinary form straight through', async () => {
    const form = await publish(await draft(asking('Your name')));
    expect(form.status).toBe('PUBLISHED');
    expect(form.review).toBeNull();
    expect((await publicForm(form.slug)).status).toBe('open');
  });

  it('holds a form linking to a shortener or other unsafe site', async () => {
    const held = await publish(
      await draft(asking('Your name', { description: 'Details at https://bit.ly/abc123' })),
    );
    expect(held.status).toBe('UNDER_REVIEW');
    expect(held.review?.reasons).toEqual(['links to a site on a list of unsafe sites']);
  });

  it('lets an approved form be published again, but holds it for something new', async () => {
    const held = await publish(await draft(asking('Your password')));
    await admin().post(`/api/admin/review/${held.id}`, { action: 'approve' }).expect(200);

    const again = await publish(await edit(held, asking('Your new password')));
    expect(again.status).toBe('PUBLISHED');

    const worse = await publish(await edit(again, asking('Your password and card CVV')));
    expect(worse.status).toBe('UNDER_REVIEW');
    expect(worse.review?.reasons).toContain("asks for a card's security code");
  });

  it('releases a held form once the creator takes the problem out', async () => {
    const held = await publish(await draft(asking('Your OTP')));
    const fixed = await publish(await edit(held, asking('Your name')));
    expect(fixed.status).toBe('PUBLISHED');
  });
});

describe('reporting a form', () => {
  const report = (slug: string, ip: string, reason = 'phishing') =>
    request(app)
      .post(`/api/public/forms/${slug}/report`)
      .set('X-Forwarded-For', ip)
      .send({ reason, details: 'It asked for my bank login' });

  it(`holds a form once ${String(REPORTS_TO_HOLD)} different people report it`, async () => {
    const form = await publish(await draft(asking('Your name')));
    for (let person = 1; person < REPORTS_TO_HOLD; person++) {
      await report(form.slug, `203.0.113.${String(person)}`).expect(204);
      // The same person again counts once.
      await report(form.slug, `203.0.113.${String(person)}`).expect(204);
    }
    expect((await publicForm(form.slug)).status).toBe('open');
    expect(await prisma.formReport.count({ where: { formId: form.id } })).toBe(REPORTS_TO_HOLD - 1);

    await report(form.slug, '203.0.113.99').expect(204);
    expect((await publicForm(form.slug)).status).toBe('unavailable');

    // Held for reports: republishing doesn't release it, whatever it says.
    const current = formDetailSchema.parse(
      (await editor().get(`/api/forms/${form.id}`).expect(200)).body,
    );
    expect(current.review?.reasons).toEqual(['was reported by people who saw it']);
    expect((await publish(current)).status).toBe('UNDER_REVIEW');
  });

  it('stores no address, only a hash', async () => {
    const form = await publish(await draft(asking('Your name')));
    await report(form.slug, '198.51.100.7').expect(204);
    const stored = await prisma.formReport.findFirstOrThrow({ where: { formId: form.id } });
    expect(JSON.stringify(stored)).not.toContain('198.51.100.7');
    expect(stored.reporterHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses unknown forms and reasons', async () => {
    await report('no-such-form', '203.0.113.1').expect(404);
    const form = await publish(await draft(asking('Your name')));
    await report(form.slug, '203.0.113.1', 'boring').expect(400);
  });
});

describe('the admin review queue', () => {
  it('lists held and reported forms for admins, and only for admins', async () => {
    const held = await publish(await draft(asking('Your UPI PIN')));
    const reported = await publish(await draft(asking('Your name')));
    await request(app)
      .post(`/api/public/forms/${reported.slug}/report`)
      .send({ reason: 'spam' })
      .expect(204);
    await publish(await draft(asking('Your favourite colour')));

    await editor().get('/api/admin/review').expect(403);
    const queue = adminReviewQueueSchema.parse((await admin().get('/api/admin/review')).body);
    expect(queue.items.map((item) => item.formId)).toEqual([held.id, reported.id]);
    expect(queue.items[0]?.heldFor).toBe('content');
    expect(queue.items[0]?.reasons).toContain('asks for a card or UPI PIN');
    expect(queue.items[1]).toMatchObject({ status: 'PUBLISHED', openReports: 1 });

    const detail = adminFormReviewSchema.parse(
      (await admin().get(`/api/admin/review/${held.id}`).expect(200)).body,
    );
    expect(detail.questions).toEqual(['Your UPI PIN']);
    expect(detail.matches[0]).toMatchObject({ path: 'fields.0.label', excerpt: 'Your UPI PIN' });
    expect(detail.creator).toMatchObject({ email: 'editor@example.com', suspended: false });
  });

  it('logs every decision, with the note', async () => {
    const held = await publish(await draft(asking('Your OTP')));
    const res = await admin()
      .post(`/api/admin/review/${held.id}`, { action: 'approve', note: 'A school login, fine' })
      .expect(200);
    const detail = adminFormReviewSchema.parse(res.body);
    expect(detail.status).toBe('PUBLISHED');
    expect(detail.history[0]).toMatchObject({
      action: 'form.approve',
      note: 'A school login, fine',
      adminName: 'Admin',
    });
  });

  it('dismisses reports on a live form, which stays live', async () => {
    const form = await publish(await draft(asking('Your name')));
    await request(app).post(`/api/public/forms/${form.slug}/report`).send({ reason: 'spam' });
    await admin().post(`/api/admin/review/${form.id}`, { action: 'dismiss_reports' }).expect(200);
    const queue = adminReviewQueueSchema.parse((await admin().get('/api/admin/review')).body);
    expect(queue.items).toEqual([]);
    expect((await publicForm(form.slug)).status).toBe('open');
  });

  it('refuses actions that make no sense for the form', async () => {
    const form = await publish(await draft(asking('Your name')));
    const res = await admin()
      .post(`/api/admin/review/${form.id}`, { action: 'approve' })
      .expect(409);
    expect(errorCode(res.body)).toBe('CONFLICT');
  });
});

describe('suspending', () => {
  it('takes a form offline until an admin restores it', async () => {
    const form = await publish(await draft(asking('Your name')));
    await admin().post(`/api/admin/review/${form.id}`, { action: 'suspend' }).expect(200);
    expect((await publicForm(form.slug)).status).toBe('unavailable');

    const current = formDetailSchema.parse((await editor().get(`/api/forms/${form.id}`)).body);
    const refused = await editor()
      .post(`/api/forms/${form.id}/publish`, { version: current.version })
      .expect(403);
    expect(errorCode(refused.body)).toBe('FORM_SUSPENDED');

    await admin().post(`/api/admin/review/${form.id}`, { action: 'restore' }).expect(200);
    expect((await publish(current)).status).toBe('PUBLISHED');
  });

  it('signs a suspended account out, keeps it out, and takes its forms offline', async () => {
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Mallory', email: 'mallory@example.org', password: 'correct horse battery' })
      .expect(201);
    const mallory = meResponseSchema.parse(registered.body);
    const cookie = registered.get('Set-Cookie') ?? [];
    const form = await publish(await draft(asking('Your name')));
    // Mallory's form: made by her account.
    await prisma.form.update({ where: { id: form.id }, data: { createdById: mallory.user.id } });

    await admin()
      .post(`/api/admin/users/${mallory.user.id}/suspension`, { suspended: true, note: 'Phishing' })
      .expect(204);
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'mallory@example.org', password: 'correct horse battery' })
      .expect(403);
    expect(errorCode(login.body)).toBe('ACCOUNT_SUSPENDED');
    // A wrong password still says only that.
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'mallory@example.org', password: 'not her password' })
      .expect(401);
    expect(errorCode(wrong.body)).toBe('UNAUTHORIZED');
    expect((await publicForm(form.slug)).status).toBe('unavailable');

    await admin()
      .post(`/api/admin/users/${mallory.user.id}/suspension`, { suspended: false })
      .expect(204);
    expect((await publicForm(form.slug)).status).toBe('open');
    const actions = await prisma.adminAction.findMany({ orderBy: { createdAt: 'asc' } });
    expect(actions.map((action) => action.action)).toEqual(['user.suspend', 'user.unsuspend']);
  });

  it('never suspends an admin', async () => {
    await admin().post(`/api/admin/users/${adminId}/suspension`, { suspended: true }).expect(403);
  });
});

describe('new accounts', () => {
  /** A member of the team whose account was made just now. */
  async function newEditor() {
    const user = await prisma.user.create({
      data: { name: 'Newbie', email: 'newbie@example.com', passwordHash: 'x' },
    });
    await prisma.membership.create({
      data: { userId: user.id, workspaceId: team.workspaceId, role: 'EDITOR' },
    });
    return user.id;
  }

  it('may not redirect people to another site yet', async () => {
    const as = requestAs(app, await newEditor());
    const schema = asking('Your name');
    const [ending] = schema.logic.endScreens;
    if (!ending) throw new Error('A form always has an end screen');
    const redirecting = {
      ...schema,
      logic: {
        ...schema.logic,
        endScreens: [
          { ...ending, redirect: { url: 'https://example.com/next', delaySeconds: 0, params: [] } },
        ],
      },
    };
    const form = await draft(redirecting, as);
    const res = await as
      .post(`/api/forms/${form.id}/publish`, { version: form.version })
      .expect(403);
    expect(errorCode(res.body)).toBe('NEW_ACCOUNT_LIMIT');
    // An older account may.
    expect((await publish(await draft(redirecting))).status).toBe('PUBLISHED');
  });

  it(`take ${String(NEW_ACCOUNT_LIMITS.responses)} responses across their forms, then stop`, async () => {
    const as = requestAs(app, await newEditor());
    const form = await publish(await draft(asking('Your name'), as), as);
    await prisma.submission.createMany({
      data: Array.from({ length: NEW_ACCOUNT_LIMITS.responses }, () => ({
        formId: form.id,
        answers: {},
        metadata: {},
      })),
    });
    expect((await publicForm(form.slug)).status).toBe('closed');
    const res = await request(app)
      .post(`/api/public/forms/${form.slug}/submissions`)
      .send({ answers: answerFor(form) })
      .expect(410);
    expect(errorCode(res.body)).toBe('FORM_CLOSED');
  });
});

describe('signing up', () => {
  it('refuses throwaway inboxes, at the email field', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Eve', email: 'eve@mail.yopmail.com', password: 'correct horse battery' })
      .expect(400);
    const details = z
      .array(validationIssueSchema)
      .parse(apiErrorSchema.parse(res.body).error.details);
    expect(details.map((issue) => issue.path)).toEqual(['email']);
    expect(details[0]?.message).toContain('temporary inboxes');
  });
});

describe('email verification, when it is required', () => {
  const mailer = createFakeMailer();
  const strict = createTestApp({ REQUIRE_EMAIL_VERIFICATION: 'on' }, { mailer });

  it('holds publishing until the emailed link is followed', async () => {
    const agent = request.agent(strict);
    const registered = await agent
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'ada@example.org', password: 'correct horse battery' })
      .expect(201);
    const me = meResponseSchema.parse(registered.body);
    expect(me.user.mustVerifyEmail).toBe(true);
    const workspaceId = me.workspaces[0]?.id ?? '';

    const { id } = formDetailSchema.parse(
      (await agent.post(`/api/workspaces/${workspaceId}/forms`).send({ title: 'Survey' })).body,
    );
    const created = formDetailSchema.parse(
      (await agent.patch(`/api/forms/${id}`).send({ version: 1, draftSchema: asking('Your name') }))
        .body,
    );
    const refused = await agent
      .post(`/api/forms/${created.id}/publish`)
      .send({ version: created.version })
      .expect(403);
    expect(errorCode(refused.body)).toBe('EMAIL_NOT_VERIFIED');

    const email = mailer.sent.find(({ messages }) => messages[0]?.to === 'ada@example.org');
    const token = /token=([^\s&]+)/.exec(email?.messages[0]?.text ?? '')?.[1];
    expect(token).toBeDefined();
    await request(strict)
      .post('/api/auth/verify-email')
      .send({ token: decodeURIComponent(token ?? '') })
      .expect(204);

    expect(
      meResponseSchema.parse((await agent.get('/api/auth/me')).body).user.mustVerifyEmail,
    ).toBe(undefined);
    await agent
      .post(`/api/forms/${created.id}/publish`)
      .send({ version: created.version })
      .expect(200);
  });

  it('refuses a link that is not ours', async () => {
    await request(strict).post('/api/auth/verify-email').send({ token: 'nope' }).expect(400);
  });
});

describe('webhooks', () => {
  it('refuses addresses on the blocklist', async () => {
    const form = await draft(asking('Your name'));
    const res = await editor()
      .post(`/api/forms/${form.id}/webhooks`, { url: 'https://bit.ly/hook' })
      .expect(400);
    const details = z
      .array(validationIssueSchema)
      .parse(apiErrorSchema.parse(res.body).error.details);
    expect(details.map((issue) => issue.path)).toEqual(['url']);
    expect(details[0]?.message).toContain('link shortener');
  });
});

describe('the Turnstile spam check', () => {
  const checked = () => createTestApp({ TURNSTILE_URL: turnstileUrl });

  it('asks for a passing token on forms that switch it on', async () => {
    const withCheck = checked();
    const form = await publish(await draft(asking('Your name')));
    await prisma.form.update({
      where: { id: form.id },
      data: {
        liveSettings: {
          access: {
            oneResponsePer: 'off',
            requireEmail: false,
            allowEdits: false,
            unlisted: true,
            captcha: true,
          },
        },
      },
    });
    const page = publicFormResponseSchema.parse(
      (await request(withCheck).get(`/api/public/forms/${form.slug}`)).body,
    );
    // Cloudflare's test key, outside production.
    expect(page.status === 'open' && page.access.captchaSiteKey).toBe('1x00000000000000000000AA');

    const submit = (captchaToken?: string) =>
      request(withCheck)
        .post(`/api/public/forms/${form.slug}/submissions`)
        .send({ answers: answerFor(form), ...(captchaToken && { captchaToken }) });
    expect(errorCode((await submit().expect(403)).body)).toBe('CAPTCHA_FAILED');
    expect(errorCode((await submit('fail').expect(403)).body)).toBe('CAPTCHA_FAILED');
    await submit('pass').expect(201);
  });

  it('is not asked for on other forms', async () => {
    const form = await publish(await draft(asking('Your name')));
    const page = await publicForm(form.slug);
    expect(page.status === 'open' && page.access.captchaSiteKey).toBeUndefined();
  });
});
