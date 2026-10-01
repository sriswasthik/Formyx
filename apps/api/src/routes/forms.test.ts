import {
  apiErrorSchema,
  createDefaultTheme,
  createEmptyForm,
  createField,
  formDetailSchema,
  formListResponseSchema,
  getFormTemplate,
  type FormDetail,
  type Role,
} from '@formyx/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE, signSessionToken } from '../lib/session.js';
import { createTestApp, TEST_JWT_SECRET } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';

const app = createTestApp();

type Person = Role | 'OUTSIDER';
const ids = { users: {} as Record<Person, string>, workspace: '', otherWorkspace: '' };

beforeEach(async () => {
  await resetDatabase();
  const [workspace, otherWorkspace] = await Promise.all([
    prisma.workspace.create({ data: { name: 'Team', slug: 'team' } }),
    prisma.workspace.create({ data: { name: 'Elsewhere', slug: 'elsewhere' } }),
  ]);
  ids.workspace = workspace.id;
  ids.otherWorkspace = otherWorkspace.id;

  for (const person of ['OWNER', 'EDITOR', 'VIEWER', 'OUTSIDER'] as const) {
    const user = await prisma.user.create({
      data: { name: person, email: `${person.toLowerCase()}@example.com`, passwordHash: 'x' },
    });
    ids.users[person] = user.id;
    // The outsider belongs to a different workspace only.
    await prisma.membership.create({
      data: {
        userId: user.id,
        workspaceId: person === 'OUTSIDER' ? otherWorkspace.id : workspace.id,
        role: person === 'OUTSIDER' ? 'OWNER' : person,
      },
    });
  }
});

/** Requests signed in as `person`. */
function as(person: Person) {
  const cookie = `${SESSION_COOKIE}=${signSessionToken(ids.users[person], TEST_JWT_SECRET)}`;
  return {
    get: (url: string) => request(app).get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => {
      const req = request(app).post(url).set('Cookie', cookie);
      return body ? req.send(body) : req;
    },
    patch: (url: string, body: object) => request(app).patch(url).set('Cookie', cookie).send(body),
    delete: (url: string) => request(app).delete(url).set('Cookie', cookie),
  };
}

const formsUrl = (workspaceId = ids.workspace) => `/api/workspaces/${workspaceId}/forms`;

async function createForm(body: object = {}, person: Person = 'EDITOR'): Promise<FormDetail> {
  const res = await as(person).post(formsUrl(), body).expect(201);
  return formDetailSchema.parse(res.body);
}

async function addSubmissions(formId: string, count: number) {
  await prisma.submission.createMany({
    data: Array.from({ length: count }, () => ({ formId, answers: {}, metadata: {} })),
  });
}

async function listForms(query = '', person: Person = 'VIEWER') {
  const res = await as(person).get(`${formsUrl()}${query}`).expect(200);
  return formListResponseSchema.parse(res.body).forms;
}

describe('POST /api/workspaces/:workspaceId/forms', () => {
  it('creates a blank draft by default', async () => {
    const form = await createForm();

    expect(form).toMatchObject({
      workspaceId: ids.workspace,
      title: 'Untitled form',
      status: 'DRAFT',
      version: 1,
      responseCount: 0,
      publishedAt: null,
      publishedSchema: null,
      draftSchema: createEmptyForm(),
      theme: createDefaultTheme(),
      publishedTheme: null,
    });
    expect(form.slug).toMatch(/^untitled-form-[a-z0-9]{8}$/);

    const stored = await prisma.form.findUniqueOrThrow({ where: { id: form.id } });
    expect(stored.createdById).toBe(ids.users.EDITOR);
  });

  it('creates a form from a template, with an optional custom title', async () => {
    const form = await createForm({ templateId: 'event_registration', title: ' Summit 2026 ' });

    expect(form.title).toBe('Summit 2026');
    expect(form.slug).toMatch(/^summit-2026-[a-z0-9]{8}$/);
    expect(form.draftSchema.fields.map((field) => field.label)).toEqual(
      getFormTemplate('event_registration')
        .build()
        .fields.map((field) => field.label),
    );
    expect(form.draftSchema.settings.submitButtonText).toBe('Register');
  });

  it('gives every form its own slug', async () => {
    const [a, b] = await Promise.all([createForm(), createForm()]);
    expect(a.slug).not.toBe(b.slug);
  });

  it('rejects unknown templates and blank titles', async () => {
    const unknown = await as('EDITOR').post(formsUrl(), { templateId: 'quiz' }).expect(400);
    const blank = await as('EDITOR').post(formsUrl(), { title: '   ' }).expect(400);

    expect(apiErrorSchema.parse(unknown.body).error.code).toBe('VALIDATION_ERROR');
    expect(apiErrorSchema.parse(blank.body).error.details).toEqual([
      { path: 'title', message: 'Enter a title' },
    ]);
  });
});

describe('GET /api/workspaces/:workspaceId/forms', () => {
  it("lists the workspace's forms, most recently edited first, with response counts", async () => {
    const older = await createForm({ title: 'Older' });
    const newer = await createForm({ title: 'Newer' });
    await addSubmissions(older.id, 3);
    await as('EDITOR').patch(`/api/forms/${older.id}`, { version: 1, title: 'Older, renamed' });
    await as('OUTSIDER').post(formsUrl(ids.otherWorkspace)).expect(201);

    const forms = await listForms();

    expect(forms.map((form) => [form.title, form.responseCount])).toEqual([
      ['Older, renamed', 3],
      ['Newer', 0],
    ]);
    expect(forms[1]).toEqual({
      id: newer.id,
      workspaceId: ids.workspace,
      title: 'Newer',
      slug: newer.slug,
      status: 'DRAFT',
      version: 1,
      responseCount: 0,
      createdAt: newer.createdAt,
      updatedAt: newer.updatedAt,
      publishedAt: null,
    });
  });

  it('searches titles, ignoring case and treating % and _ literally', async () => {
    await createForm({ title: 'Customer feedback' });
    await createForm({ title: 'Event registration' });
    await createForm({ title: '100% satisfaction' });

    expect((await listForms('?search=FEED')).map((form) => form.title)).toEqual([
      'Customer feedback',
    ]);
    expect((await listForms('?search=%25')).map((form) => form.title)).toEqual([
      '100% satisfaction',
    ]);
    expect(await listForms('?search=_')).toEqual([]);
  });

  it('filters by status, in any case', async () => {
    const published = await createForm({ title: 'Live' });
    await createForm({ title: 'Work in progress' });
    await prisma.form.update({ where: { id: published.id }, data: { status: 'PUBLISHED' } });

    expect((await listForms('?status=published')).map((form) => form.title)).toEqual(['Live']);
    expect((await listForms('?status=DRAFT')).map((form) => form.title)).toEqual([
      'Work in progress',
    ]);
    expect(await listForms('?status=closed')).toEqual([]);
  });

  it('rejects unknown statuses', async () => {
    const res = await as('VIEWER').get(`${formsUrl()}?status=archived`).expect(400);
    expect(apiErrorSchema.parse(res.body).error.details).toEqual([
      expect.objectContaining({ path: 'status' }),
    ]);
  });

  it('is never cached', async () => {
    const res = await as('VIEWER').get(formsUrl()).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /api/forms/:formId', () => {
  it('returns the full form', async () => {
    const created = await createForm({ templateId: 'feedback_survey' });
    await addSubmissions(created.id, 2);

    const res = await as('VIEWER').get(`/api/forms/${created.id}`).expect(200);

    expect(formDetailSchema.parse(res.body)).toEqual({ ...created, responseCount: 2 });
  });

  it('answers unknown forms with 404', async () => {
    const res = await as('OWNER').get('/api/forms/missing').expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Form not found' } });
  });
});

describe('PATCH /api/forms/:formId', () => {
  it('renames the form and bumps its version', async () => {
    const form = await createForm();

    const res = await as('EDITOR')
      .patch(`/api/forms/${form.id}`, { version: 1, title: 'Customer feedback' })
      .expect(200);

    const updated = formDetailSchema.parse(res.body);
    expect(updated).toMatchObject({ title: 'Customer feedback', version: 2, slug: form.slug });
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(form.updatedAt));
    expect(updated.draftSchema).toEqual(form.draftSchema);
  });

  it('saves the draft schema', async () => {
    const form = await createForm();
    const draftSchema = {
      ...createEmptyForm(),
      fields: [{ ...createField('email'), label: 'Work email', required: true }],
    };

    const res = await as('EDITOR')
      .patch(`/api/forms/${form.id}`, { version: 1, draftSchema })
      .expect(200);

    expect(formDetailSchema.parse(res.body)).toMatchObject({ version: 2, draftSchema });
  });

  it('rejects an outdated version with 409 and leaves the form unchanged', async () => {
    const form = await createForm({ title: 'Original' });
    await as('EDITOR').patch(`/api/forms/${form.id}`, { version: 1, title: 'First edit' });

    // A second editor still has version 1 open.
    const res = await as('OWNER')
      .patch(`/api/forms/${form.id}`, { version: 1, title: 'Second edit' })
      .expect(409);

    expect(apiErrorSchema.parse(res.body).error).toEqual({
      code: 'CONFLICT',
      message: 'This form was changed somewhere else. Load the latest version and try again.',
      details: { currentVersion: 2 },
    });
    const stored = await prisma.form.findUniqueOrThrow({ where: { id: form.id } });
    expect(stored).toMatchObject({ title: 'First edit', version: 2 });
  });

  it('lets exactly one of two simultaneous updates win', async () => {
    const form = await createForm();

    const results = await Promise.all(
      ['A', 'B', 'C'].map((title) =>
        as('EDITOR').patch(`/api/forms/${form.id}`, { version: 1, title }),
      ),
    );

    expect(results.map((res) => res.status).sort()).toEqual([200, 409, 409]);
    const stored = await prisma.form.findUniqueOrThrow({ where: { id: form.id } });
    expect(stored.version).toBe(2);
  });

  it('rejects an invalid draft schema with field-level details', async () => {
    const form = await createForm();
    const rating = { ...createField('rating'), ratingScale: 20 };

    const res = await as('EDITOR')
      .patch(`/api/forms/${form.id}`, {
        version: 1,
        draftSchema: { ...createEmptyForm(), fields: [rating] },
      })
      .expect(400);

    expect(apiErrorSchema.parse(res.body).error.details).toEqual([
      { path: 'draftSchema.fields.0.ratingScale', message: 'Use a whole number from 3 to 10' },
    ]);
  });

  it.each([
    [{ title: 'No version' }, 'version'],
    [{ version: 1 }, ''],
    [{ version: 1, title: '' }, 'title'],
  ])('rejects %j', async (body, path) => {
    const form = await createForm();
    const res = await as('EDITOR').patch(`/api/forms/${form.id}`, body).expect(400);
    expect(apiErrorSchema.parse(res.body).error.details).toEqual([
      expect.objectContaining({ path }),
    ]);
  });

  it('accepts schemas larger than the default 100 KB body limit', async () => {
    const form = await createForm();
    const fields = Array.from({ length: 200 }, () => ({
      ...createField('long_text'),
      label: 'Question',
      description: 'x'.repeat(1500),
    }));

    const res = await as('EDITOR').patch(`/api/forms/${form.id}`, {
      version: 1,
      draftSchema: { ...createEmptyForm(), fields },
    });

    expect(JSON.stringify(fields).length).toBeGreaterThan(300_000);
    expect(res.status).toBe(200);
  });

  it('answers unknown forms with 404', async () => {
    await as('OWNER').patch('/api/forms/missing', { version: 1, title: 'x' }).expect(404);
  });
});

describe('POST /api/forms/:formId/duplicate', () => {
  it('copies the draft into a new form with its own slug and no responses', async () => {
    const source = await createForm({ templateId: 'feedback_survey', title: 'NPS' });
    await addSubmissions(source.id, 4);

    const res = await as('EDITOR').post(`/api/forms/${source.id}/duplicate`).expect(201);

    const copy = formDetailSchema.parse(res.body);
    expect(copy).toMatchObject({
      title: 'NPS (copy)',
      status: 'DRAFT',
      version: 1,
      responseCount: 0,
      draftSchema: source.draftSchema,
      theme: source.theme,
    });
    expect(copy.id).not.toBe(source.id);
    expect(copy.slug).toMatch(/^nps-copy-[a-z0-9]{8}$/);
    expect(await listForms()).toHaveLength(2);
  });

  it('shortens long titles so the copy still fits', async () => {
    const source = await createForm({ title: 'a'.repeat(120) });

    const res = await as('EDITOR').post(`/api/forms/${source.id}/duplicate`).expect(201);

    const { title } = formDetailSchema.parse(res.body);
    expect(title).toHaveLength(120);
    expect(title.endsWith(' (copy)')).toBe(true);
  });
});

describe('DELETE /api/forms/:formId', () => {
  it('deletes the form and its responses', async () => {
    const form = await createForm();
    await addSubmissions(form.id, 2);

    await as('EDITOR').delete(`/api/forms/${form.id}`).expect(204);

    await as('EDITOR').get(`/api/forms/${form.id}`).expect(404);
    expect(await prisma.submission.count()).toBe(0);
  });

  it('answers unknown forms with 404', async () => {
    await as('OWNER').delete('/api/forms/missing').expect(404);
  });
});

describe('authorization', () => {
  let formId = '';

  beforeEach(async () => {
    formId = (await createForm({ title: 'Private' })).id;
  });

  const reads = [
    ['list forms', (person: Person) => as(person).get(formsUrl())],
    ['get a form', (person: Person) => as(person).get(`/api/forms/${formId}`)],
  ] as const;

  const writes = [
    ['create a form', (person: Person) => as(person).post(formsUrl())],
    [
      'update a form',
      (person: Person) => as(person).patch(`/api/forms/${formId}`, { version: 1, title: 'Mine' }),
    ],
    ['duplicate a form', (person: Person) => as(person).post(`/api/forms/${formId}/duplicate`)],
    ['delete a form', (person: Person) => as(person).delete(`/api/forms/${formId}`)],
  ] as const;

  it.each([...reads, ...writes])('non-members cannot %s', async (_action, send) => {
    const res = await send('OUTSIDER').expect(403);
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'You are not a member of this workspace' },
    });
  });

  it.each(reads)('viewers can %s', async (_action, send) => {
    await send('VIEWER').expect(200);
  });

  it.each(writes)('viewers cannot %s', async (_action, send) => {
    const res = await send('VIEWER').expect(403);
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'You need editor access to do this' },
    });
  });

  it.each(writes)('editors can %s', async (_action, send) => {
    const res = await send('EDITOR');
    expect([200, 201, 204]).toContain(res.status);
  });

  it('leaves the form untouched after rejected writes', async () => {
    await as('VIEWER').patch(`/api/forms/${formId}`, { version: 1, title: 'Hijacked' });
    await as('OUTSIDER').delete(`/api/forms/${formId}`);

    const stored = await prisma.form.findUniqueOrThrow({ where: { id: formId } });
    expect(stored).toMatchObject({ title: 'Private', version: 1 });
  });

  it('requires a session', async () => {
    await request(app).get(formsUrl()).expect(401);
    await request(app).get(`/api/forms/${formId}`).expect(401);
  });
});
