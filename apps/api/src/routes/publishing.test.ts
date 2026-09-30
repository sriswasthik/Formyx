import {
  apiErrorSchema,
  createEmptyForm,
  createField,
  formDetailSchema,
  type FormDetail,
  type FormSchema,
} from '@formyx/shared';
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
const viewer = () => requestAs(app, team.users.VIEWER);

const READY: FormSchema = {
  ...createEmptyForm(),
  fields: [{ ...createField('short_text'), label: 'Your name', required: true }],
};

/** A form whose draft is `draftSchema`, at version 2. */
async function createDraft(
  draftSchema: FormSchema = READY,
  title = 'Sign-up',
): Promise<FormDetail> {
  const created = await editor()
    .post(`/api/workspaces/${team.workspaceId}/forms`, { title })
    .expect(201);
  const { id } = formDetailSchema.parse(created.body);
  const res = await editor().patch(`/api/forms/${id}`, { version: 1, draftSchema }).expect(200);
  return formDetailSchema.parse(res.body);
}

async function publish(form: Pick<FormDetail, 'id' | 'version'>): Promise<FormDetail> {
  const res = await editor()
    .post(`/api/forms/${form.id}/publish`, { version: form.version })
    .expect(200);
  return formDetailSchema.parse(res.body);
}

describe('POST /api/forms/:formId/publish', () => {
  it('snapshots the draft and title and puts the form live', async () => {
    const draft = await createDraft();

    const published = await publish(draft);

    expect(published).toMatchObject({
      status: 'PUBLISHED',
      publishedSchema: READY,
      publishedTitle: 'Sign-up',
      // Publishing leaves the draft's version alone; the editor keeps saving from it.
      version: draft.version,
    });
    expect(published.publishedAt).not.toBeNull();
  });

  it('keeps the snapshot while the draft changes, until it is published again', async () => {
    const published = await publish(await createDraft());
    const extended: FormSchema = {
      ...READY,
      fields: [...READY.fields, { ...createField('email'), label: 'Email' }],
    };
    const edited = await editor()
      .patch(`/api/forms/${published.id}`, { version: 2, draftSchema: extended, title: 'Renamed' })
      .expect(200);
    const afterEdit = formDetailSchema.parse(edited.body);

    expect(afterEdit).toMatchObject({ publishedSchema: READY, publishedTitle: 'Sign-up' });

    const republished = await publish(afterEdit);
    expect(republished).toMatchObject({
      status: 'PUBLISHED',
      publishedSchema: extended,
      publishedTitle: 'Renamed',
    });
    expect(Date.parse(republished.publishedAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(published.publishedAt ?? ''),
    );
  });

  it('refuses an unfinished draft with 422 and what to fix', async () => {
    const draft = await createDraft({
      ...createEmptyForm(),
      fields: [createField('single_choice'), { ...createField('dropdown'), options: [] }],
    });

    const res = await editor()
      .post(`/api/forms/${draft.id}/publish`, { version: draft.version })
      .expect(422);

    expect(apiErrorSchema.parse(res.body).error).toEqual({
      code: 'FORM_INCOMPLETE',
      message: 'Finish the form before publishing it.',
      details: [
        { path: 'fields.0.label', message: 'Write the question' },
        { path: 'fields.1.label', message: 'Write the question' },
        { path: 'fields.1.options', message: 'Add at least one option' },
      ],
    });
    const stored = await prisma.form.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored).toMatchObject({ status: 'DRAFT', publishedSchema: null });
  });

  it('refuses to publish a draft that changed since the editor loaded it', async () => {
    const draft = await createDraft();

    const res = await editor()
      .post(`/api/forms/${draft.id}/publish`, { version: draft.version - 1 })
      .expect(409);

    expect(apiErrorSchema.parse(res.body).error).toMatchObject({
      code: 'CONFLICT',
      details: { currentVersion: draft.version },
    });
  });

  it('needs the version being published', async () => {
    const draft = await createDraft();
    await editor().post(`/api/forms/${draft.id}/publish`).expect(400);
  });

  it('keeps a closed form closed when publishing changes', async () => {
    const published = await publish(await createDraft());
    await editor().post(`/api/forms/${published.id}/close`).expect(200);

    expect((await publish(published)).status).toBe('CLOSED');
  });

  it('is for editors only', async () => {
    const draft = await createDraft();
    await viewer().post(`/api/forms/${draft.id}/publish`, { version: draft.version }).expect(403);
  });

  it('answers unknown forms with 404', async () => {
    await editor().post('/api/forms/nope/publish', { version: 1 }).expect(404);
  });
});

describe('POST /api/forms/:formId/close and /reopen', () => {
  it('closes a published form and reopens it', async () => {
    const published = await publish(await createDraft());

    const closed = await editor().post(`/api/forms/${published.id}/close`).expect(200);
    expect(formDetailSchema.parse(closed.body).status).toBe('CLOSED');

    const reopened = await editor().post(`/api/forms/${published.id}/reopen`).expect(200);
    expect(formDetailSchema.parse(reopened.body).status).toBe('PUBLISHED');
  });

  it('only closes published forms and only reopens closed ones', async () => {
    const draft = await createDraft();
    const draftClose = await editor().post(`/api/forms/${draft.id}/close`).expect(409);
    expect(apiErrorSchema.parse(draftClose.body).error.message).toBe(
      'Only published forms can be closed.',
    );

    await publish(draft);
    const reopenLive = await editor().post(`/api/forms/${draft.id}/reopen`).expect(409);
    expect(apiErrorSchema.parse(reopenLive.body).error.message).toBe(
      'Only closed forms can be reopened.',
    );

    await editor().post(`/api/forms/${draft.id}/close`).expect(200);
    const closeAgain = await editor().post(`/api/forms/${draft.id}/close`).expect(409);
    expect(apiErrorSchema.parse(closeAgain.body).error.message).toBe(
      'This form is already closed.',
    );
  });

  it('will not reopen a form that reached its response limit until the limit is raised', async () => {
    const limited: FormSchema = {
      ...READY,
      settings: { ...READY.settings, closeAfterResponses: 1 },
    };
    const published = await publish(await createDraft(limited));
    await prisma.submission.create({ data: { formId: published.id, answers: {}, metadata: {} } });
    await editor().post(`/api/forms/${published.id}/close`).expect(200);

    const refused = await editor().post(`/api/forms/${published.id}/reopen`).expect(409);
    expect(apiErrorSchema.parse(refused.body).error.message).toBe(
      'This form has reached its response limit. Raise or remove the limit and publish, then reopen it.',
    );

    const raised = await editor()
      .patch(`/api/forms/${published.id}`, {
        version: published.version,
        draftSchema: { ...limited, settings: { ...limited.settings, closeAfterResponses: 10 } },
      })
      .expect(200);
    await publish(formDetailSchema.parse(raised.body));
    await editor().post(`/api/forms/${published.id}/reopen`).expect(200);
  });

  it('will not reopen a form past its closing date', async () => {
    const dated: FormSchema = {
      ...READY,
      settings: { ...READY.settings, closeAt: '2020-01-01T00:00:00Z' },
    };
    const published = await publish(await createDraft(dated));
    await editor().post(`/api/forms/${published.id}/close`).expect(200);

    const refused = await editor().post(`/api/forms/${published.id}/reopen`).expect(409);
    expect(apiErrorSchema.parse(refused.body).error.message).toMatch(/past its closing date/);
  });

  it('is for editors only', async () => {
    const published = await publish(await createDraft());
    await viewer().post(`/api/forms/${published.id}/close`).expect(403);
    await viewer().post(`/api/forms/${published.id}/reopen`).expect(403);
  });
});
