import {
  apiErrorSchema,
  BYTES_PER_MB,
  createDefaultTheme,
  createEmptyForm,
  createField,
  formDetailSchema,
  uploadSignatureSchema,
  type FormSchema,
} from '@formyx/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { signCloudinaryParams } from '../lib/upload-storage.js';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createFakeCloudinary, FAKE_API_SECRET } from '../test/fake-cloudinary.js';
import { createPublishedForm } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

const cloud = createFakeCloudinary();
const app = createTestApp({}, { storage: cloud.storage });
const appWithoutUploads = createTestApp();
let team: Team;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

const name = { ...createField('short_text'), label: 'Name' };
const cv = {
  ...createField('file'),
  label: 'Your CV',
  required: true,
  fileConfig: { maxSizeMb: 2, allowedTypes: ['pdf' as const] },
};
const SCHEMA: FormSchema = { ...createEmptyForm(), fields: [name, cv] };

const signatureUrl = (query: Record<string, string>) =>
  `/api/uploads/signature?${new URLSearchParams(query).toString()}`;

describe('GET /api/uploads/signature for respondents', () => {
  it('signs an upload into the question’s folder, limited to its formats', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);

    const res = await request(app)
      .get(signatureUrl({ purpose: 'answer', form: form.slug, field: cv.id }))
      .expect(200);
    const signed = uploadSignatureSchema.parse(res.body);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(signed).toMatchObject({
      folder: `formyx/forms/${form.id}/${cv.id}`,
      allowedFormats: 'pdf',
      maxBytes: 2 * BYTES_PER_MB,
      uploadUrl: 'https://api.cloudinary.com/v1_1/formyx-test/auto/upload',
    });
    expect(signed.signature).toBe(
      signCloudinaryParams(
        { folder: signed.folder, allowed_formats: 'pdf', timestamp: signed.timestamp },
        FAKE_API_SECRET,
      ),
    );
  });

  it('only signs for file questions of forms taking responses', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);

    await request(app)
      .get(signatureUrl({ purpose: 'answer', form: form.slug, field: name.id }))
      .expect(404);
    await request(app)
      .get(signatureUrl({ purpose: 'answer', form: 'missing', field: cv.id }))
      .expect(404);
    await prisma.form.update({ where: { id: form.id }, data: { status: 'CLOSED' } });
    const closed = await request(app)
      .get(signatureUrl({ purpose: 'answer', form: form.slug, field: cv.id }))
      .expect(410);
    expect(apiErrorSchema.parse(closed.body).error.code).toBe('FORM_CLOSED');
  });

  it('says when uploads are not set up', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const res = await request(appWithoutUploads)
      .get(signatureUrl({ purpose: 'answer', form: form.slug, field: cv.id }))
      .expect(503);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('UPLOADS_UNAVAILABLE');
  });
});

describe('GET /api/uploads/signature for logos, cover and background images', () => {
  it.each(['logo', 'cover', 'background'] as const)(
    'signs %s images for editors, into the form’s theme folder, images only',
    async (purpose) => {
      const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
      const res = await requestAs(app, team.users.EDITOR)
        .get(signatureUrl({ purpose, formId: form.id }))
        .expect(200);

      expect(uploadSignatureSchema.parse(res.body)).toMatchObject({
        folder: `formyx/themes/${form.id}`,
        allowedFormats: 'jpg,jpeg,png,webp,gif',
        maxBytes: 5 * BYTES_PER_MB,
      });
    },
  );

  it('refuses viewers, outsiders and signed-out visitors', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const stranger = await prisma.user.create({
      data: { name: 'Eve', email: 'eve@example.com', passwordHash: 'x' },
    });

    await requestAs(app, team.users.VIEWER)
      .get(signatureUrl({ purpose: 'cover', formId: form.id }))
      .expect(403);
    await requestAs(app, stranger.id)
      .get(signatureUrl({ purpose: 'cover', formId: form.id }))
      .expect(403);
    await request(app)
      .get(signatureUrl({ purpose: 'cover', formId: form.id }))
      .expect(401);
  });
});

describe('uploaded files in responses', () => {
  const folderOf = (formId: string, fieldId = cv.id) => `formyx/forms/${formId}/${fieldId}`;
  const submit = (slug: string, answers: object, target = app) =>
    request(target).post(`/api/public/forms/${slug}/submissions`).send({ answers });

  async function storedAnswer(formId: string) {
    const submission = await prisma.submission.findFirstOrThrow({ where: { formId } });
    return (submission.answers as Record<string, unknown>)[cv.id];
  }

  it('keeps a file uploaded for the question, with the size storage reports', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const file = cloud.upload(folderOf(form.id), { name: 'cv.pdf', bytes: 1_500_000 });

    // The browser under-reports the size; storage's figure is the one kept.
    await submit(form.slug, { [name.id]: 'Ada', [cv.id]: { ...file, size: 10 } }).expect(201);

    expect(await storedAnswer(form.id)).toEqual({ ...file, size: 1_500_000 });
  });

  it.each([
    [
      'uploaded for another question',
      (formId: string) =>
        cloud.upload(folderOf(formId, 'fld_other'), { name: 'cv.pdf', bytes: 100 }),
      'This file wasn’t uploaded for this question. Upload it again.',
    ],
    [
      'uploaded for another form',
      () => cloud.upload(folderOf('form_other'), { name: 'cv.pdf', bytes: 100 }),
      'This file wasn’t uploaded for this question. Upload it again.',
    ],
    [
      'bigger than the limit, whatever the browser says',
      (formId: string) => ({
        ...cloud.upload(folderOf(formId), { name: 'cv.pdf', bytes: 3 * BYTES_PER_MB }),
        size: 100,
      }),
      'This file is too big. The limit is 2 MB',
    ],
    [
      'really an image, named like a PDF',
      (formId: string) => ({
        ...cloud.upload(folderOf(formId), { name: 'cv.pdf', bytes: 100, format: 'png' }),
        name: 'cv.pdf',
      }),
      'This type of file isn’t accepted here',
    ],
  ])('refuses a file %s', async (_case, make, message) => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const res = await submit(form.slug, { [name.id]: 'Ada', [cv.id]: make(form.id) }).expect(400);

    expect(apiErrorSchema.parse(res.body).error.details).toEqual([
      { path: `answers.${cv.id}`, message },
    ]);
    expect(await prisma.submission.count()).toBe(0);
  });

  it('refuses a made-up upload that storage does not have', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const forged = {
      url: `https://res.cloudinary.com/formyx-test/raw/upload/v1/${folderOf(form.id)}/x_cv.pdf`,
      publicId: `${folderOf(form.id)}/x_cv.pdf`,
      name: 'cv.pdf',
      size: 10,
      type: 'application/pdf',
    };

    const res = await submit(form.slug, { [name.id]: 'Ada', [cv.id]: forged }).expect(400);

    expect(apiErrorSchema.parse(res.body).error.details).toEqual([
      { path: `answers.${cv.id}`, message: 'This upload could not be found. Upload it again.' },
    ]);
  });

  it('refuses links to files elsewhere', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const elsewhere = {
      url: 'https://evil.example/cv.pdf',
      publicId: 'cv',
      name: 'cv.pdf',
      size: 10,
      type: 'application/pdf',
    };

    await submit(form.slug, { [name.id]: 'Ada', [cv.id]: elsewhere }).expect(400);
  });

  it('cannot take files while uploads are off', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const file = cloud.upload(folderOf(form.id), { name: 'cv.pdf', bytes: 100 });

    const res = await submit(
      form.slug,
      { [name.id]: 'Ada', [cv.id]: file },
      appWithoutUploads,
    ).expect(503);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('UPLOADS_UNAVAILABLE');
  });
});

describe('logo and cover images in the theme', () => {
  async function draft() {
    const created = await requestAs(app, team.users.EDITOR)
      .post(`/api/workspaces/${team.workspaceId}/forms`, {})
      .expect(201);
    return formDetailSchema.parse(created.body);
  }

  it('takes an image uploaded for the form, and keeps it on later saves', async () => {
    const form = await draft();
    const logo = cloud.upload(`formyx/themes/${form.id}`, {
      name: 'logo.png',
      bytes: 2000,
      format: 'png',
    });
    const defaults = createDefaultTheme();
    const theme = { ...defaults, branding: { ...defaults.branding, logoUrl: logo.url } };

    const saved = formDetailSchema.parse(
      (
        await requestAs(app, team.users.EDITOR)
          .patch(`/api/forms/${form.id}`, { version: form.version, theme })
          .expect(200)
      ).body,
    );
    expect(saved.theme.branding.logoUrl).toBe(logo.url);

    // Saving again with the same logo is fine even with storage gone.
    await requestAs(appWithoutUploads, team.users.EDITOR)
      .patch(`/api/forms/${form.id}`, { version: saved.version, title: 'Renamed', theme })
      .expect(200);
  });

  it.each([
    ['any other site', () => 'https://evil.example/logo.png'],
    [
      'another form',
      () =>
        cloud.upload('formyx/themes/form_other', { name: 'l.png', bytes: 10, format: 'png' }).url,
    ],
    [
      'a respondent’s upload',
      () =>
        cloud.upload('formyx/forms/form_other/fld', { name: 'l.png', bytes: 10, format: 'png' })
          .url,
    ],
  ])('refuses images from %s', async (_case, url) => {
    const form = await draft();
    const defaults = createDefaultTheme();
    const coverImage = { url: url(), focalPoint: { x: 50, y: 50 } };
    const res = await requestAs(app, team.users.EDITOR)
      .patch(`/api/forms/${form.id}`, {
        version: form.version,
        theme: { ...defaults, layout: { ...defaults.layout, coverImage } },
      })
      .expect(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('checks background image layers too', async () => {
    const form = await draft();
    const defaults = createDefaultTheme();
    const res = await requestAs(app, team.users.EDITOR)
      .patch(`/api/forms/${form.id}`, {
        version: form.version,
        theme: {
          ...defaults,
          background: {
            layers: [
              ...defaults.background.layers,
              {
                id: 'photo',
                type: 'image',
                url: 'https://evil.example/background.jpg',
                focalPoint: { x: 50, y: 50 },
                fit: 'cover',
                opacity: 1,
                blendMode: 'normal',
              },
            ],
          },
        },
      })
      .expect(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });
});
