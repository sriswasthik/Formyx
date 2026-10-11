import {
  apiErrorSchema,
  createEmptyForm,
  createField,
  createOption,
  deleteSubmissionsResponseSchema,
  submissionPageSchema,
  submissionRecordSchema,
  type FormSchema,
  type SubmissionPage,
} from '@formyx/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createPublishedForm, createSubmission } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

const app = createTestApp();
let team: Team;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

const editor = () => requestAs(app, team.users.EDITOR);
const viewer = () => requestAs(app, team.users.VIEWER);

async function outsider() {
  const user = await prisma.user.create({
    data: { name: 'Eve', email: 'eve@example.com', passwordHash: 'x' },
  });
  return requestAs(app, user.id);
}

const red = createOption('Red');
const lightGreen = createOption('Light green');
const cheese = createOption('Cheese');
const olives = createOption('Olives');
const name = { ...createField('short_text'), label: 'Your name' };
const color = { ...createField('single_choice'), label: 'Colour', options: [red, lightGreen] };
const toppings = { ...createField('multi_choice'), label: 'Toppings', options: [cheese, olives] };
const age = { ...createField('number'), label: 'Age' };
const comment = { ...createField('long_text'), label: 'Comments, if any' };
const SURVEY: FormSchema = {
  ...createEmptyForm(),
  fields: [{ ...createField('statement'), label: 'Hello' }, name, color, toppings, age, comment],
};

const at = (minute: number) => new Date(Date.UTC(2026, 8, 1, 12, minute));
const listUrl = (formId: string, query = '') => `/api/forms/${formId}/submissions${query}`;

async function page(formId: string, query = ''): Promise<SubmissionPage> {
  const res = await editor().get(listUrl(formId, query)).expect(200);
  return submissionPageSchema.parse(res.body);
}

describe('GET /api/forms/:formId/submissions', () => {
  it('lists responses newest first, with their answers and details', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    const first = await createSubmission(prisma, form.id, {
      answers: { [name.id]: 'Ada' },
      createdAt: at(1),
      completionTimeMs: 42_000,
    });
    const second = await createSubmission(prisma, form.id, { createdAt: at(2) });

    const result = await page(form.id);

    expect(result.total).toBe(2);
    expect(result.nextCursor).toBeNull();
    expect(result.submissions.map(({ id }) => id)).toEqual([second.id, first.id]);
    expect(result.submissions[1]).toEqual({
      id: first.id,
      createdAt: at(1).toISOString(),
      completionTimeMs: 42_000,
      answers: { [name.id]: 'Ada' },
      metadata: { userAgent: 'Vitest', referrer: null },
      // Stored straight into the database here, so no outcome was worked out.
      outcome: null,
      respondentEmail: null,
      editedAt: null,
    });
  });

  it('pages through every response exactly once, even when times are equal', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    const created = [];
    for (const minute of [1, 2, 2, 2, 3, 4, 5]) {
      created.push(await createSubmission(prisma, form.id, { createdAt: at(minute) }));
    }
    const expected = created
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .map(({ id }) => id);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query = `?limit=3${cursor ? `&cursor=${cursor}` : ''}`;
      const result = await page(form.id, query);
      expect(result.total).toBe(7);
      seen.push(...result.submissions.map(({ id }) => id));
      cursor = result.nextCursor;
      pages += 1;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toEqual(expected);
  });

  it('pages oldest first', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    const ids = [];
    for (const minute of [1, 2, 3]) {
      ids.push((await createSubmission(prisma, form.id, { createdAt: at(minute) })).id);
    }

    const first = await page(form.id, '?order=oldest&limit=2');
    const second = await page(form.id, `?order=oldest&limit=2&cursor=${first.nextCursor ?? ''}`);

    expect(first.submissions.map(({ id }) => id)).toEqual(ids.slice(0, 2));
    expect(second.submissions.map(({ id }) => id)).toEqual(ids.slice(2));
    expect(second.nextCursor).toBeNull();
  });

  it('refuses cursors it did not make, and pages that are too big', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);

    const badCursor = await editor().get(listUrl(form.id, '?cursor=not-a-cursor')).expect(400);
    const tooBig = await editor().get(listUrl(form.id, '?limit=101')).expect(400);

    expect(apiErrorSchema.parse(badCursor.body).error.code).toBe('BAD_REQUEST');
    expect(apiErrorSchema.parse(tooBig.body).error.code).toBe('VALIDATION_ERROR');
  });

  describe('search', () => {
    async function seeded() {
      const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
      const ada = await createSubmission(prisma, form.id, {
        answers: { [name.id]: 'Ada Lovelace', [color.id]: red.id, [age.id]: 36 },
        createdAt: at(1),
      });
      const grace = await createSubmission(prisma, form.id, {
        answers: {
          [name.id]: 'Grace Hopper',
          [color.id]: lightGreen.id,
          [toppings.id]: [cheese.id, olives.id],
          [comment.id]: 'Loved it: 100% would return_again',
        },
        createdAt: at(2),
      });
      return { form, ada, grace };
    }

    const ids = (result: SubmissionPage) => result.submissions.map(({ id }) => id);

    it('matches text answers, ignoring case', async () => {
      const { form, ada } = await seeded();
      const result = await page(form.id, '?search=lovelace');
      expect(ids(result)).toEqual([ada.id]);
      expect(result.total).toBe(1);
    });

    it('matches choices by the option label people see, not the stored id', async () => {
      const { form, ada, grace } = await seeded();

      expect(ids(await page(form.id, '?search=GREEN'))).toEqual([grace.id]);
      expect(ids(await page(form.id, '?search=olives'))).toEqual([grace.id]);
      expect(ids(await page(form.id, `?search=${red.id}`))).toEqual([]);
      expect(ids(await page(form.id, '?search=red'))).toEqual([ada.id]);
    });

    it('matches numbers as written', async () => {
      const { form, ada } = await seeded();
      expect(ids(await page(form.id, '?search=36'))).toEqual([ada.id]);
    });

    it('treats % and _ as plain characters', async () => {
      const { form, grace } = await seeded();

      expect(ids(await page(form.id, `?search=${encodeURIComponent('100%')}`))).toEqual([grace.id]);
      expect(ids(await page(form.id, '?search=return_again'))).toEqual([grace.id]);
      expect(ids(await page(form.id, `?search=${encodeURIComponent('%')}`))).toEqual([grace.id]);
      expect(ids(await page(form.id, '?search=_'))).toEqual([grace.id]);
    });

    it('can keep to responses that answered a question', async () => {
      const { form, grace } = await seeded();
      const result = await page(form.id, `?answered=${comment.id}`);
      expect(ids(result)).toEqual([grace.id]);
      expect(result.total).toBe(1);
    });
  });

  describe('access', () => {
    it('lets any member read responses', async () => {
      const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
      await createSubmission(prisma, form.id);
      const res = await viewer().get(listUrl(form.id)).expect(200);
      expect(submissionPageSchema.parse(res.body).total).toBe(1);
    });

    it('needs a session', async () => {
      const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
      await request(app).get(listUrl(form.id)).expect(401);
    });

    it('keeps out people from other workspaces', async () => {
      const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
      const res = await (await outsider()).get(listUrl(form.id)).expect(403);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('FORBIDDEN');
    });

    it('says when the form does not exist', async () => {
      await editor().get(listUrl('missing')).expect(404);
    });
  });
});

describe('GET /api/forms/:formId/submissions/:submissionId', () => {
  it('returns one response', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    const submission = await createSubmission(prisma, form.id, { answers: { [age.id]: 7 } });

    const res = await viewer()
      .get(`${listUrl(form.id)}/${submission.id}`)
      .expect(200);

    expect(submissionRecordSchema.parse(res.body)).toMatchObject({
      id: submission.id,
      answers: { [age.id]: 7 },
    });
  });

  it("does not show another form's response through this form", async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    const other = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    const elsewhere = await createSubmission(prisma, other.id);

    await editor()
      .get(`${listUrl(form.id)}/${elsewhere.id}`)
      .expect(404);
  });
});

describe('deleting responses', () => {
  const remaining = (formId: string) => prisma.submission.count({ where: { formId } });

  it('lets editors delete one response', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    const submission = await createSubmission(prisma, form.id);

    await editor()
      .delete(`${listUrl(form.id)}/${submission.id}`)
      .expect(204);

    expect(await remaining(form.id)).toBe(0);
  });

  it('does not let viewers delete', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    const submission = await createSubmission(prisma, form.id);

    await viewer()
      .delete(`${listUrl(form.id)}/${submission.id}`)
      .expect(403);
    await viewer()
      .post(`${listUrl(form.id)}/bulk-delete`, { ids: [submission.id] })
      .expect(403);

    expect(await remaining(form.id)).toBe(1);
  });

  it("never deletes another form's response through this form", async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    const other = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    const elsewhere = await createSubmission(prisma, other.id);

    await editor()
      .delete(`${listUrl(form.id)}/${elsewhere.id}`)
      .expect(404);
    const bulk = await editor()
      .post(`${listUrl(form.id)}/bulk-delete`, { ids: [elsewhere.id] })
      .expect(200);

    expect(deleteSubmissionsResponseSchema.parse(bulk.body)).toEqual({ deleted: 0 });
    expect(await remaining(other.id)).toBe(1);
  });

  it('deletes the selected responses in one go', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    const [a, b, kept] = [
      await createSubmission(prisma, form.id),
      await createSubmission(prisma, form.id),
      await createSubmission(prisma, form.id),
    ];

    const res = await editor()
      .post(`${listUrl(form.id)}/bulk-delete`, { ids: [a.id, b.id, a.id, 'unknown'] })
      .expect(200);

    expect(deleteSubmissionsResponseSchema.parse(res.body)).toEqual({ deleted: 2 });
    const left = await prisma.submission.findMany({ where: { formId: form.id } });
    expect(left.map(({ id }) => id)).toEqual([kept.id]);
  });

  it('asks for between 1 and 100 ids', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    const tooMany = Array.from({ length: 101 }, (_, index) => `id_${index}`);

    await editor()
      .post(`${listUrl(form.id)}/bulk-delete`, { ids: [] })
      .expect(400);
    await editor()
      .post(`${listUrl(form.id)}/bulk-delete`, { ids: tooMany })
      .expect(400);
  });
});

describe('GET /api/forms/:formId/submissions/export', () => {
  /** The body as sent, byte for byte (no decoding that might drop the BOM). */
  function exportCsv(agent: ReturnType<typeof requestAs>, formId: string) {
    return agent
      .get(`${listUrl(formId)}/export`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      });
  }

  it('streams a CSV with question labels as headers and escaped answers', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY, 'Café survey');
    const older = await createSubmission(prisma, form.id, {
      answers: { [name.id]: '=cmd()', [age.id]: -3 },
      createdAt: at(1),
      completionTimeMs: 61_400,
    });
    const newer = await createSubmission(prisma, form.id, {
      answers: {
        [name.id]: 'Zoë "Z" Smith',
        [color.id]: lightGreen.id,
        [toppings.id]: [cheese.id, olives.id],
        [comment.id]: 'Line one\nLine two',
      },
      createdAt: at(2),
    });

    const res = await exportCsv(editor(), form.id).expect(200);
    const body = (res.body as Buffer).toString('utf8');

    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="cafe-survey-responses-' +
        `${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    expect(body.startsWith('﻿')).toBe(true);
    expect(body.slice(1)).toBe(
      [
        'Response ID,Submitted at (UTC),Your name,Colour,Toppings,Age,"Comments, if any",Time to complete (seconds)',
        `${newer.id},${at(2).toISOString()},"Zoë ""Z"" Smith",Light green,"Cheese, Olives",,"Line one\nLine two",`,
        `${older.id},${at(1).toISOString()},'=cmd(),,,-3,,61`,
        '',
      ].join('\r\n'),
    );
  });

  it('includes every response when there are more than one batch', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    await prisma.submission.createMany({
      data: Array.from({ length: 501 }, (_, index) => ({
        formId: form.id,
        answers: { [age.id]: index },
        metadata: {},
        createdAt: new Date(at(0).getTime() + index * 1000),
      })),
    });

    const res = await exportCsv(viewer(), form.id).expect(200);
    const lines = (res.body as Buffer).toString('utf8').trimEnd().split('\r\n');

    expect(lines).toHaveLength(502);
    expect(new Set(lines.slice(1).map((line) => line.split(',')[0])).size).toBe(501);
  });

  it('keeps out people from other workspaces', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SURVEY);
    await (await outsider()).get(`${listUrl(form.id)}/export`).expect(403);
  });
});
