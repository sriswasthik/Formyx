import {
  apiErrorSchema,
  VIEW_TOKEN_PATTERN,
  viewResponseSchema,
  createEmptyForm,
  createField,
  createOption,
  formDetailSchema,
  publicFormResponseSchema,
  submissionResponseSchema,
  createDefaultLiveSettings,
  type AccessSettings,
  type FormDetail,
  type FormSchema,
} from '@formyx/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

const app = createTestApp();
let team: Team;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

const editor = () => requestAs(app, team.users.EDITOR);

// An RSVP: guests is asked only of people attending, and is required when shown.
const name = { ...createField('short_text'), label: 'Your name', required: true };
const yes = createOption('Yes');
const no = createOption('No');
const attending = {
  ...createField('single_choice'),
  label: 'Are you coming?',
  required: true,
  options: [yes, no],
};
const guests = {
  ...createField('number'),
  label: 'How many guests?',
  required: true,
  validation: { min: 0, max: 5 },
  conditions: [{ sourceFieldId: attending.id, operator: 'equals' as const, value: yes.id }],
};
const email = { ...createField('email'), label: 'Email' };
const RSVP: FormSchema = { ...createEmptyForm(), fields: [name, attending, guests, email] };

/** Changes the form's access settings, which take effect without publishing. */
async function setAccess(formId: string, access: Partial<AccessSettings>) {
  await editor()
    .patch(`/api/forms/${formId}/settings`, {
      access: { ...createDefaultLiveSettings().access, ...access },
    })
    .expect(200);
}

/** A published form, with its draft left as published unless changed afterwards. */
async function publishForm(schema: FormSchema = RSVP): Promise<FormDetail> {
  const created = await editor()
    .post(`/api/workspaces/${team.workspaceId}/forms`, { title: 'Party RSVP' })
    .expect(201);
  const { id } = formDetailSchema.parse(created.body);
  await editor().patch(`/api/forms/${id}`, { version: 1, draftSchema: schema }).expect(200);
  const res = await editor().post(`/api/forms/${id}/publish`, { version: 2 }).expect(200);
  return formDetailSchema.parse(res.body);
}

const formUrl = (slug: string) => `/api/public/forms/${slug}`;
const submit = (slug: string, body: object) =>
  request(app)
    .post(`${formUrl(slug)}/submissions`)
    .send(body);

const VALID = { [name.id]: 'Ada', [attending.id]: yes.id, [guests.id]: '2' };

const storedSubmissions = (formId: string) =>
  prisma.submission.findMany({ where: { formId }, orderBy: { createdAt: 'asc' } });

describe('GET /api/public/forms/:slug', () => {
  it('returns the published form to anyone, without an account', async () => {
    const form = await publishForm();

    const res = await request(app).get(formUrl(form.slug)).expect(200);

    expect(publicFormResponseSchema.parse(res.body)).toEqual({
      status: 'open',
      slug: form.slug,
      title: 'Party RSVP',
      schema: RSVP,
      theme: form.theme,
      access: {
        emailStep: 'none',
        oneResponsePerBrowser: false,
        allowEdits: false,
        indexable: false,
      },
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('shows the published snapshot, never the draft', async () => {
    const form = await publishForm();
    const draft = { ...RSVP, fields: [name] };
    await editor()
      .patch(`/api/forms/${form.id}`, {
        version: form.version,
        title: 'Secret',
        draftSchema: draft,
      })
      .expect(200);

    const res = await request(app).get(formUrl(form.slug)).expect(200);

    expect(res.body).toMatchObject({ title: 'Party RSVP', schema: RSVP });
    expect(JSON.stringify(res.body)).not.toContain('Secret');
    expect(Object.keys(res.body as object).sort()).toEqual([
      'access',
      'schema',
      'slug',
      'status',
      'theme',
      'title',
    ]);
  });

  it('answers 404 for unknown forms and drafts that were never published', async () => {
    const draft = await editor().post(`/api/workspaces/${team.workspaceId}/forms`, {}).expect(201);

    for (const slug of ['no-such-form', formDetailSchema.parse(draft.body).slug]) {
      const res = await request(app).get(formUrl(slug)).expect(404);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    }
  });

  it.each<[string, (form: FormDetail) => Promise<unknown>]>([
    ['closed', (form) => editor().post(`/api/forms/${form.id}/close`).expect(200)],
    ['past its closing time', (form) => setAccess(form.id, { closesAt: '2020-01-01T00:00:00Z' })],
    [
      'full',
      async (form) => {
        await setAccess(form.id, { responseLimit: 1 });
        await prisma.submission.create({ data: { formId: form.id, answers: {}, metadata: {} } });
      },
    ],
  ])('says the form is closed, with only its title, when it is %s', async (_state, close) => {
    const form = await publishForm();
    await close(form);

    // An expected state rather than an error, so browsers do not log it as a failed request.
    const res = await request(app).get(formUrl(form.slug)).expect(200);

    expect(res.body).toEqual({
      status: 'closed',
      slug: form.slug,
      title: 'Party RSVP',
      locale: { language: 'en', dateFormat: 'auto', numberFormat: 'auto' },
    });
  });
});

describe('POST /api/public/forms/:slug/view', () => {
  it('counts a view of an open form', async () => {
    const form = await publishForm();

    const first = await request(app)
      .post(`${formUrl(form.slug)}/view`)
      .expect(201);
    const second = await request(app)
      .post(`${formUrl(form.slug)}/view`)
      .expect(201);

    expect(await prisma.formView.count({ where: { formId: form.id } })).toBe(2);
    // Each visit gets its own random token, for its progress reports.
    const tokens = [first.body, second.body].map((body) => viewResponseSchema.parse(body).token);
    expect(tokens[0]).toMatch(VIEW_TOKEN_PATTERN);
    expect(tokens[0]).not.toBe(tokens[1]);
  });

  it('does not count views of drafts or closed forms', async () => {
    const form = await publishForm();
    await editor().post(`/api/forms/${form.id}/close`).expect(200);

    await request(app)
      .post(`${formUrl(form.slug)}/view`)
      .expect(410);
    await request(app)
      .post(`${formUrl('no-such-form')}/view`)
      .expect(404);
    expect(await prisma.formView.count()).toBe(0);
  });
});

describe('POST /api/public/forms/:slug/submissions', () => {
  it('stores normalised answers with the completion time and client details', async () => {
    const form = await publishForm();

    const res = await submit(form.slug, {
      answers: { ...VALID, [name.id]: '  Ada Lovelace ', [email.id]: '' },
      completionTimeMs: 48_000,
      referrer: 'https://example.com/invite',
    })
      .set('User-Agent', 'Formyx tests')
      .expect(201);

    const [stored] = await storedSubmissions(form.id);
    expect(stored?.id).toBe(submissionResponseSchema.parse(res.body).id);
    expect(stored).toMatchObject({
      answers: { [name.id]: 'Ada Lovelace', [attending.id]: yes.id, [guests.id]: 2 },
      completionTimeMs: 48_000,
      metadata: { userAgent: 'Formyx tests', referrer: 'https://example.com/invite' },
    });
  });

  it('rejects invalid answers with a problem for each question, storing nothing', async () => {
    const form = await publishForm();

    const res = await submit(form.slug, {
      answers: { [attending.id]: yes.id, [guests.id]: 9, [email.id]: 'not-an-email' },
    }).expect(400);

    expect(apiErrorSchema.parse(res.body).error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Some answers need your attention.',
      details: [
        { path: `answers.${name.id}`, message: 'This question is required' },
        { path: `answers.${guests.id}`, message: 'Enter a number of at most 5' },
        { path: `answers.${email.id}`, message: 'Enter a valid email address' },
      ],
    });
    expect(await storedSubmissions(form.id)).toEqual([]);
  });

  it('drops answers to hidden and unknown questions, and does not require hidden ones', async () => {
    const form = await publishForm();

    await submit(form.slug, {
      answers: {
        [name.id]: 'Ada',
        [attending.id]: no.id,
        // Typed before switching to "No", so the question is hidden now.
        [guests.id]: '3',
        fld_unknown: 'Injected',
      },
    }).expect(201);

    const [stored] = await storedSubmissions(form.id);
    expect(stored?.answers).toEqual({ [name.id]: 'Ada', [attending.id]: no.id });
  });

  it('checks answers against the published form, not the draft', async () => {
    const form = await publishForm();
    const stricter = {
      ...RSVP,
      fields: RSVP.fields.map((field) => ({ ...field, required: true })),
    };
    await editor()
      .patch(`/api/forms/${form.id}`, { version: form.version, draftSchema: stricter })
      .expect(200);

    // Email is required in the draft only.
    await submit(form.slug, { answers: VALID }).expect(201);
  });

  it('refuses responses to closed forms', async () => {
    const form = await publishForm();
    await editor().post(`/api/forms/${form.id}/close`).expect(200);

    const res = await submit(form.slug, { answers: VALID }).expect(410);

    expect(apiErrorSchema.parse(res.body).error.code).toBe('FORM_CLOSED');
    expect(await storedSubmissions(form.id)).toEqual([]);
  });

  it('refuses responses after the closing time', async () => {
    const form = await publishForm();
    await setAccess(form.id, { closesAt: '2020-01-01T00:00:00Z' });
    await submit(form.slug, { answers: VALID }).expect(410);
  });

  it('closes the form with the response that reaches its limit', async () => {
    const form = await publishForm();
    await setAccess(form.id, { responseLimit: 2 });

    await submit(form.slug, { answers: VALID }).expect(201);
    await submit(form.slug, { answers: VALID }).expect(201);
    await submit(form.slug, { answers: VALID }).expect(410);

    expect(await storedSubmissions(form.id)).toHaveLength(2);
    const stored = await prisma.form.findUniqueOrThrow({ where: { id: form.id } });
    expect(stored.status).toBe('CLOSED');
  });

  it('never overshoots the limit, even with simultaneous responses', async () => {
    const form = await publishForm();
    await setAccess(form.id, { responseLimit: 3 });

    const results = await Promise.all(
      Array.from({ length: 6 }, () => submit(form.slug, { answers: VALID })),
    );

    expect(results.map((res) => res.status).sort()).toEqual([201, 201, 201, 410, 410, 410]);
    expect(await storedSubmissions(form.id)).toHaveLength(3);
  });

  it('pretends to accept responses that filled in the honeypot, but stores nothing', async () => {
    const form = await publishForm();

    const res = await submit(form.slug, {
      answers: VALID,
      website: 'https://spam.example',
    }).expect(201);

    expect(submissionResponseSchema.parse(res.body).id).toEqual(expect.any(String));
    expect(await storedSubmissions(form.id)).toEqual([]);
  });

  it('rejects malformed bodies', async () => {
    const form = await publishForm();
    await submit(form.slug, {}).expect(400);
    await submit(form.slug, { answers: { [name.id]: { nested: 'object' } } }).expect(400);
  });

  it('answers 404 for unknown forms', async () => {
    await submit('no-such-form', { answers: VALID }).expect(404);
  });

  it('limits responses per client and form', async () => {
    const limitedApp = createTestApp({ SUBMISSION_RATE_LIMIT_MAX: '2' });
    const [first, second] = [await publishForm(), await publishForm()];
    const send = (slug: string) =>
      request(limitedApp)
        .post(`${formUrl(slug)}/submissions`)
        .send({ answers: VALID });

    await send(first.slug).expect(201);
    await send(first.slug).expect(201);
    const res = await send(first.slug).expect(429);

    expect(apiErrorSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
    // Another form still takes responses from the same client.
    await send(second.slug).expect(201);
  });
});
