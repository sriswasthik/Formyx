import {
  accessTokenResponseSchema,
  apiErrorSchema,
  createDefaultLiveSettings,
  createEmptyForm,
  createField,
  editLoadResponseSchema,
  FORM_ACCESS_HEADER,
  formDetailSchema,
  publicFormResponseSchema,
  submissionResponseSchema,
  type AccessSettings,
  type FormDetail,
  type FormSchema,
} from '@formyx/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeMailer, createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

// Who may respond, and when: passwords, opening and closing times, one response per person,
// asking for an email address, and changing a response through its private link. Every rule
// is the server's; the browser only follows along.

const mailer = createFakeMailer();
const app = createTestApp({}, { mailer });
let team: Team;

beforeEach(async () => {
  await resetDatabase();
  mailer.sent.length = 0;
  team = await createTeam(prisma);
});

const editor = () => requestAs(app, team.users.EDITOR);
const viewer = () => requestAs(app, team.users.VIEWER);

const name = { ...createField('short_text'), id: 'name', label: 'Your name', required: true };
const contact = { ...createField('email'), id: 'contact', label: 'Email' };
const SCHEMA: FormSchema = { ...createEmptyForm(), fields: [name, contact] };
const ANSWERS = { name: 'Ada' };

async function publishForm(schema: FormSchema = SCHEMA, title = 'Survey'): Promise<FormDetail> {
  const created = await editor()
    .post(`/api/workspaces/${team.workspaceId}/forms`, { title })
    .expect(201);
  const { id } = formDetailSchema.parse(created.body);
  await editor().patch(`/api/forms/${id}`, { version: 1, draftSchema: schema }).expect(200);
  const res = await editor().post(`/api/forms/${id}/publish`, { version: 2 }).expect(200);
  return formDetailSchema.parse(res.body);
}

async function setAccess(formId: string, access: Partial<AccessSettings>) {
  await editor()
    .patch(`/api/forms/${formId}/settings`, {
      access: { ...createDefaultLiveSettings().access, ...access },
    })
    .expect(200);
}

const url = (slug: string, path = '') => `/api/public/forms/${slug}${path}`;
const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

function submit(slug: string, body: object, token?: string) {
  const req = request(app).post(url(slug, '/submissions'));
  if (token) req.set(FORM_ACCESS_HEADER, token);
  return req.send(body);
}

describe('passwords', () => {
  async function lockedForm() {
    const form = await publishForm();
    await editor()
      .put(`/api/forms/${form.id}/settings/password`, { password: 'open sesame' })
      .expect(200);
    return form;
  }

  async function unlock(slug: string, password = 'open sesame') {
    const res = await request(app).post(url(slug, '/unlock')).send({ password }).expect(200);
    return accessTokenResponseSchema.parse(res.body).token;
  }

  it('shows only the title and look until unlocked, never the questions', async () => {
    const form = await lockedForm();

    const res = await request(app).get(url(form.slug)).expect(200);
    const locked = publicFormResponseSchema.parse(res.body);
    expect(locked).toMatchObject({ status: 'locked', title: 'Survey' });
    expect(JSON.stringify(res.body)).not.toContain('Your name');

    const token = await unlock(form.slug);
    const open = await request(app).get(url(form.slug)).set(FORM_ACCESS_HEADER, token).expect(200);
    expect(publicFormResponseSchema.parse(open.body).status).toBe('open');
  });

  it('refuses every way in without the password', async () => {
    const form = await lockedForm();
    expect(errorCode((await submit(form.slug, { answers: ANSWERS }).expect(403)).body)).toBe(
      'FORM_LOCKED',
    );
    await request(app).post(url(form.slug, '/view')).expect(403);
    await request(app).get(`/api/uploads/signature?purpose=answer&form=${form.slug}&field=name`);
    expect(await prisma.submission.count()).toBe(0);
  });

  it('takes responses once unlocked', async () => {
    const form = await lockedForm();
    const token = await unlock(form.slug);
    await submit(form.slug, { answers: ANSWERS }, token).expect(201);
  });

  it('says a wrong password is wrong, and stays locked', async () => {
    const form = await lockedForm();
    const res = await request(app)
      .post(url(form.slug, '/unlock'))
      .send({ password: 'guess' })
      .expect(400);
    expect(errorCode(res.body)).toBe('WRONG_CODE');
  });

  it('locks everyone out again when the password changes, and opens up when it goes', async () => {
    const form = await lockedForm();
    const before = await unlock(form.slug);

    await editor()
      .put(`/api/forms/${form.id}/settings/password`, { password: 'new secret' })
      .expect(200);
    await submit(form.slug, { answers: ANSWERS }, before).expect(403);
    await request(app)
      .post(url(form.slug, '/unlock'))
      .send({ password: 'open sesame' })
      .expect(400);
    await submit(form.slug, { answers: ANSWERS }, await unlock(form.slug, 'new secret')).expect(
      201,
    );

    await editor().put(`/api/forms/${form.id}/settings/password`, { password: null }).expect(200);
    await submit(form.slug, { answers: ANSWERS }).expect(201);
  });

  it("never opens another form with one form's token", async () => {
    const first = await lockedForm();
    const second = await lockedForm();
    const token = await unlock(first.slug);
    await submit(second.slug, { answers: ANSWERS }, token).expect(403);
  });

  it('slows down guessing', async () => {
    const form = await lockedForm();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app).post(url(form.slug, '/unlock')).send({ password: 'guess' }).expect(400);
    }
    const res = await request(app)
      .post(url(form.slug, '/unlock'))
      .send({ password: 'open sesame' })
      .expect(429);
    expect(errorCode(res.body)).toBe('RATE_LIMITED');
  });

  it('never reports the password, only that there is one', async () => {
    const form = await lockedForm();
    const res = await viewer().get(`/api/forms/${form.id}/settings`).expect(200);
    expect(res.body).toMatchObject({ hasPassword: true });
    expect(JSON.stringify(res.body)).not.toContain('open sesame');
    expect(JSON.stringify(res.body)).not.toContain('$2b$');
  });

  it('is for editors to set', async () => {
    const form = await publishForm();
    await viewer().put(`/api/forms/${form.id}/settings/password`, { password: 'x1y2' }).expect(403);
  });
});

describe('opening and closing times', () => {
  it('says when a form opens, in the workspace time zone, and takes nothing before', async () => {
    const form = await publishForm();
    await setAccess(form.id, { opensAt: '2099-01-01T09:00:00+05:30' });

    const res = await request(app).get(url(form.slug)).expect(200);
    expect(publicFormResponseSchema.parse(res.body)).toMatchObject({
      status: 'not_open',
      opensAt: '2099-01-01T09:00:00+05:30',
      timeZone: 'Asia/Kolkata',
    });
    expect(errorCode((await submit(form.slug, { answers: ANSWERS }).expect(403)).body)).toBe(
      'FORM_NOT_OPEN',
    );
  });

  it('takes responses between its opening and closing times', async () => {
    const form = await publishForm();
    await setAccess(form.id, {
      opensAt: '2020-01-01T00:00:00Z',
      closesAt: '2099-01-01T00:00:00Z',
    });
    await submit(form.slug, { answers: ANSWERS }).expect(201);
  });

  it('shows its own closed message once closed', async () => {
    const form = await publishForm();
    await setAccess(form.id, {
      closesAt: '2020-01-01T00:00:00Z',
      closedMessage: 'Applications are **closed** for this year.',
    });
    const res = await request(app).get(url(form.slug)).expect(200);
    expect(publicFormResponseSchema.parse(res.body)).toMatchObject({
      status: 'closed',
      message: 'Applications are **closed** for this year.',
    });
    await submit(form.slug, { answers: ANSWERS }).expect(410);
  });

  it('refuses a closing time before the opening time', async () => {
    const form = await publishForm();
    const res = await editor()
      .patch(`/api/forms/${form.id}/settings`, {
        access: {
          ...createDefaultLiveSettings().access,
          opensAt: '2030-01-02T00:00:00Z',
          closesAt: '2030-01-01T00:00:00Z',
        },
      })
      .expect(400);
    expect(apiErrorSchema.parse(res.body).error.details).toEqual([
      { path: 'access.closesAt', message: 'Close after it opens' },
    ]);
  });

  it('closes at once when a limit is set below the responses it has', async () => {
    const form = await publishForm();
    await submit(form.slug, { answers: ANSWERS }).expect(201);
    await submit(form.slug, { answers: ANSWERS }).expect(201);
    await setAccess(form.id, { responseLimit: 1 });

    const res = await request(app).get(url(form.slug)).expect(200);
    expect(publicFormResponseSchema.parse(res.body).status).toBe('closed');
    await submit(form.slug, { answers: ANSWERS }).expect(410);
  });
});

describe('one response per person, by email', () => {
  async function verifiedForm() {
    const form = await publishForm();
    await setAccess(form.id, { oneResponsePer: 'email' });
    return form;
  }

  /** Asks for a code for `email` and reads it from the email that was sent. */
  async function requestCode(slug: string, email: string): Promise<string> {
    await request(app).post(url(slug, '/verify')).send({ email }).expect(202);
    const last = mailer.sent.at(-1)?.messages[0];
    expect(last?.to).toBe(email.toLowerCase());
    const code = /\b(\d{6})\b/.exec(last?.text ?? '')?.[1];
    if (!code) throw new Error('No code in the email');
    return code;
  }

  async function verify(slug: string, email: string): Promise<string> {
    const code = await requestCode(slug, email);
    const res = await request(app)
      .post(url(slug, '/verify/check'))
      .send({ email, code })
      .expect(200);
    return accessTokenResponseSchema.parse(res.body).token;
  }

  it('tells the browser to confirm an address first', async () => {
    const form = await verifiedForm();
    const res = await request(app).get(url(form.slug)).expect(200);
    expect(res.body).toMatchObject({ access: { emailStep: 'verify' } });
  });

  it('refuses a response without a confirmed address', async () => {
    const form = await verifiedForm();
    const res = await submit(form.slug, { answers: ANSWERS, respondentEmail: 'ada@example.com' });
    expect(res.status).toBe(403);
    expect(errorCode(res.body)).toBe('VERIFICATION_REQUIRED');
  });

  it('takes one response per confirmed address, and refuses a second', async () => {
    const form = await verifiedForm();
    const token = await verify(form.slug, 'Ada@Example.com');

    await submit(form.slug, { answers: ANSWERS, verificationToken: token }).expect(201);
    const stored = await prisma.submission.findFirstOrThrow({ where: { formId: form.id } });
    expect(stored.respondentEmail).toBe('ada@example.com');
    expect(stored.respondentKey).toMatch(/^[0-9a-f]{64}$/);

    // The same token again, and a new code for the same address in other case.
    const again = await submit(form.slug, { answers: ANSWERS, verificationToken: token });
    expect(again.status).toBe(409);
    expect(errorCode(again.body)).toBe('ALREADY_RESPONDED');
    const code = await request(app)
      .post(url(form.slug, '/verify'))
      .send({ email: 'ADA@example.com' })
      .expect(409);
    expect(errorCode(code.body)).toBe('ALREADY_RESPONDED');
    expect(await prisma.submission.count({ where: { formId: form.id } })).toBe(1);
  });

  it('allows one response even when two arrive at once', async () => {
    const form = await verifiedForm();
    const token = await verify(form.slug, 'ada@example.com');
    const results = await Promise.all([
      submit(form.slug, { answers: ANSWERS, verificationToken: token }),
      submit(form.slug, { answers: ANSWERS, verificationToken: token }),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
  });

  it('says a wrong code is wrong, and gives up after a few', async () => {
    const form = await verifiedForm();
    const code = await requestCode(form.slug, 'ada@example.com');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await request(app)
        .post(url(form.slug, '/verify/check'))
        .send({ email: 'ada@example.com', code: wrong })
        .expect(400);
      expect(errorCode(res.body)).toBe('WRONG_CODE');
    }
    // Even the right code no longer works: a new one must be sent.
    await request(app)
      .post(url(form.slug, '/verify/check'))
      .send({ email: 'ada@example.com', code })
      .expect(400);
  });

  it('refuses expired codes, and codes for another address', async () => {
    const form = await verifiedForm();
    const code = await requestCode(form.slug, 'ada@example.com');
    await request(app)
      .post(url(form.slug, '/verify/check'))
      .send({ email: 'grace@example.com', code })
      .expect(400);
    await prisma.respondentVerification.updateMany({ data: { expiresAt: new Date(0) } });
    await request(app)
      .post(url(form.slug, '/verify/check'))
      .send({ email: 'ada@example.com', code })
      .expect(400);
  });

  it("never lets one form's confirmation count for another", async () => {
    const first = await verifiedForm();
    const second = await verifiedForm();
    const token = await verify(first.slug, 'ada@example.com');
    await submit(second.slug, { answers: ANSWERS, verificationToken: token }).expect(403);
  });

  it('keeps only hashes of addresses and codes', async () => {
    const form = await verifiedForm();
    await requestCode(form.slug, 'ada@example.com');
    const stored = await prisma.respondentVerification.findFirstOrThrow();
    expect(JSON.stringify(stored)).not.toContain('ada@example.com');
    expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('asking for an email address', () => {
  it('needs one with each response, and keeps it', async () => {
    const form = await publishForm();
    await setAccess(form.id, { requireEmail: true });

    const missing = await submit(form.slug, { answers: ANSWERS }).expect(400);
    expect(apiErrorSchema.parse(missing.body).error.details).toEqual([
      { path: 'respondentEmail', message: 'Enter your email address' },
    ]);
    await submit(form.slug, { answers: ANSWERS, respondentEmail: ' Ada@Example.com ' }).expect(201);
    const stored = await prisma.submission.findFirstOrThrow({ where: { formId: form.id } });
    expect(stored.respondentEmail).toBe('ada@example.com');
    // Asking is not verifying: the same address may respond again.
    await submit(form.slug, { answers: ANSWERS, respondentEmail: 'ada@example.com' }).expect(201);
  });
});

describe('changing a response', () => {
  async function editableForm() {
    const form = await publishForm();
    await setAccess(form.id, { allowEdits: true });
    return form;
  }

  it('gives a private link with each response, and keeps only its hash', async () => {
    const form = await editableForm();
    const res = await submit(form.slug, { answers: ANSWERS }).expect(201);
    const { editToken } = submissionResponseSchema.parse(res.body);
    expect(editToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await prisma.submission.findFirstOrThrow({ where: { formId: form.id } });
    expect(stored.editTokenHash).not.toBe(editToken);
  });

  it('opens the answers behind the link, and changes that response', async () => {
    const form = await editableForm();
    const created = submissionResponseSchema.parse(
      (await submit(form.slug, { answers: ANSWERS }).expect(201)).body,
    );
    const token = created.editToken ?? '';

    const loaded = await request(app).post(url(form.slug, '/edit')).send({ token }).expect(200);
    expect(editLoadResponseSchema.parse(loaded.body).answers).toEqual(ANSWERS);

    const changed = await submit(form.slug, {
      answers: { name: 'Ada Lovelace' },
      editToken: token,
    }).expect(200);
    expect(submissionResponseSchema.parse(changed.body).id).toBe(created.id);
    const stored = await prisma.submission.findMany({ where: { formId: form.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.answers).toEqual({ name: 'Ada Lovelace' });
    expect(stored[0]?.editedAt).not.toBeNull();
  });

  it('checks changed answers like new ones', async () => {
    const form = await editableForm();
    const { editToken } = submissionResponseSchema.parse(
      (await submit(form.slug, { answers: ANSWERS }).expect(201)).body,
    );
    await submit(form.slug, { answers: { name: '' }, editToken }).expect(400);
  });

  it('stops working when changes are switched off, or the form closes', async () => {
    const form = await editableForm();
    const { editToken } = submissionResponseSchema.parse(
      (await submit(form.slug, { answers: ANSWERS }).expect(201)).body,
    );
    await setAccess(form.id, { allowEdits: false });
    const off = await submit(form.slug, { answers: ANSWERS, editToken }).expect(404);
    expect(errorCode(off.body)).toBe('EDIT_UNAVAILABLE');
    await request(app).post(url(form.slug, '/edit')).send({ token: editToken }).expect(404);

    await setAccess(form.id, { allowEdits: true });
    await editor().post(`/api/forms/${form.id}/close`).expect(200);
    await submit(form.slug, { answers: ANSWERS, editToken }).expect(410);
  });

  it("refuses unknown links, and one form's link on another", async () => {
    const first = await editableForm();
    const second = await editableForm();
    const { editToken } = submissionResponseSchema.parse(
      (await submit(first.slug, { answers: ANSWERS }).expect(201)).body,
    );
    await submit(second.slug, { answers: ANSWERS, editToken }).expect(404);
    await submit(first.slug, { answers: ANSWERS, editToken: 'x'.repeat(43) }).expect(404);
  });

  it('gives no link when the form does not allow changes', async () => {
    const form = await publishForm();
    const res = await submit(form.slug, { answers: ANSWERS }).expect(201);
    expect(submissionResponseSchema.parse(res.body).editToken).toBeUndefined();
  });
});

describe('old addresses', () => {
  it('keep working after the slug changes, and a taken slug is refused', async () => {
    const form = await publishForm();
    const other = await publishForm(SCHEMA, 'Other');
    await editor().put(`/api/forms/${form.id}/slug`, { slug: 'summer-camp' }).expect(200);

    const old = await request(app).get(url(form.slug)).expect(200);
    expect(publicFormResponseSchema.parse(old.body).slug).toBe('summer-camp');
    await submit(form.slug, { answers: ANSWERS }).expect(201);
    await submit('summer-camp', { answers: ANSWERS }).expect(201);

    const taken = await editor().put(`/api/forms/${other.id}/slug`, { slug: form.slug });
    expect(taken.status).toBe(409);
    const reserved = await editor().put(`/api/forms/${other.id}/slug`, { slug: 'api' });
    expect(reserved.status).toBe(400);
  });
});
