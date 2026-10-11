import {
  apiErrorSchema,
  createEmptyForm,
  createField,
  createOption,
  dateKey,
  formAnalyticsSchema,
  formDetailSchema,
  type FormAnalytics,
  type FormSchema,
} from '@formyx/shared';
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

const viewer = () => requestAs(app, team.users.VIEWER);

const yes = createOption('Yes');
const no = createOption('No');
const coming = { ...createField('single_choice'), label: 'Coming?', options: [yes, no] };
const stars = { ...createField('rating'), label: 'Rating', ratingScale: 5 };
const guests = { ...createField('number'), label: 'Guests' };
const note = { ...createField('short_text'), label: 'Note' };
const SCHEMA: FormSchema = { ...createEmptyForm(), fields: [coming, stars, guests, note] };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function analytics(formId: string, query = ''): Promise<FormAnalytics> {
  const res = await viewer().get(`/api/forms/${formId}/analytics${query}`).expect(200);
  return formAnalyticsSchema.parse(res.body);
}

describe('GET /api/forms/:formId/analytics', () => {
  it('totals views, responses and completion times over all time', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await prisma.formView.createMany({
      data: Array.from({ length: 4 }, () => ({ formId: form.id })),
    });
    await createSubmission(prisma, form.id, { completionTimeMs: 30_000 });
    await createSubmission(prisma, form.id, { completionTimeMs: 90_000 });
    // Older than any chart range, but still part of the totals.
    await createSubmission(prisma, form.id, { createdAt: new Date(Date.now() - 400 * DAY) });

    const { totals } = await analytics(form.id);

    expect(totals).toEqual({
      views: 4,
      responses: 3,
      timedResponses: 2,
      totalCompletionTimeMs: 120_000,
    });
  });

  it('counts responses per day for the range, with empty days included', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const now = Date.now();
    await createSubmission(prisma, form.id, { createdAt: new Date(now - 2 * DAY) });
    await createSubmission(prisma, form.id, { createdAt: new Date(now - 2 * DAY) });
    await createSubmission(prisma, form.id, { createdAt: new Date(now) });
    await createSubmission(prisma, form.id, { createdAt: new Date(now - 10 * DAY) });

    const { responsesPerDay } = await analytics(form.id, '?range=7d&tz=UTC');

    expect(responsesPerDay.range).toBe('7d');
    expect(responsesPerDay.timeZone).toBe('UTC');
    expect(responsesPerDay.days).toHaveLength(7);
    expect(responsesPerDay.days.at(-1)?.date).toBe(dateKey(new Date(now).toISOString(), 'UTC'));
    expect(responsesPerDay.days.map((day) => day.responses)).toEqual([0, 0, 0, 0, 2, 0, 1]);
  });

  it("puts each response on the viewer's calendar day", async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const instant = new Date(Date.now() - HOUR);
    await createSubmission(prisma, form.id, { createdAt: instant });

    // UTC+14 and UTC-11 are always on different calendar days.
    for (const timeZone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kolkata']) {
      const { responsesPerDay } = await analytics(
        form.id,
        `?range=7d&tz=${encodeURIComponent(timeZone)}`,
      );
      const counted = responsesPerDay.days.filter((day) => day.responses > 0);

      expect(responsesPerDay.days.at(-1)?.date).toBe(dateKey(new Date().toISOString(), timeZone));
      expect(counted).toEqual([{ date: dateKey(instant.toISOString(), timeZone), responses: 1 }]);
    }
  });

  it('covers 30 days by default, and 90 on request', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    expect((await analytics(form.id)).responsesPerDay.days).toHaveLength(30);
    expect((await analytics(form.id, '?range=90d')).responsesPerDay.days).toHaveLength(90);
  });

  it('summarises each question of the published form', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await createSubmission(prisma, form.id, {
      answers: { [coming.id]: yes.id, [stars.id]: 5, [guests.id]: 2, [note.id]: 'See you' },
      createdAt: new Date(Date.now() - 2 * HOUR),
    });
    await createSubmission(prisma, form.id, {
      answers: { [coming.id]: no.id, [stars.id]: 3, [guests.id]: 0 },
      createdAt: new Date(Date.now() - HOUR),
    });

    const { questions } = await analytics(form.id);

    expect(questions).toEqual([
      {
        kind: 'choice',
        fieldId: coming.id,
        label: 'Coming?',
        type: 'single_choice',
        answered: 2,
        options: [
          { id: yes.id, label: 'Yes', count: 1 },
          { id: no.id, label: 'No', count: 1 },
        ],
        removed: 0,
      },
      {
        kind: 'rating',
        fieldId: stars.id,
        label: 'Rating',
        answered: 2,
        scale: 5,
        counts: [0, 0, 1, 0, 1],
        sum: 8,
      },
      {
        kind: 'number',
        type: 'number',
        fieldId: guests.id,
        label: 'Guests',
        answered: 2,
        sum: 2,
        min: 0,
        max: 2,
      },
      {
        kind: 'text',
        fieldId: note.id,
        label: 'Note',
        type: 'short_text',
        answered: 1,
        latest: [
          {
            submissionId: expect.any(String) as string,
            createdAt: expect.any(String) as string,
            value: 'See you',
          },
        ],
      },
    ]);
  });

  it('has nothing to summarise before the form is published', async () => {
    const created = await requestAs(app, team.users.EDITOR)
      .post(`/api/workspaces/${team.workspaceId}/forms`, { title: 'Draft' })
      .expect(201);
    const draft = formDetailSchema.parse(created.body);

    const result = await analytics(draft.id);

    expect(result.questions).toEqual([]);
    expect(result.totals.responses).toBe(0);
  });

  it('refuses unknown ranges and time zones', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);

    const range = await viewer().get(`/api/forms/${form.id}/analytics?range=1y`).expect(400);
    const zone = await viewer().get(`/api/forms/${form.id}/analytics?tz=Mars%2FBase`).expect(400);

    expect(apiErrorSchema.parse(range.body).error.code).toBe('VALIDATION_ERROR');
    expect(apiErrorSchema.parse(zone.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('keeps out people from other workspaces', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const stranger = await prisma.user.create({
      data: { name: 'Eve', email: 'eve@example.com', passwordHash: 'x' },
    });
    await requestAs(app, stranger.id).get(`/api/forms/${form.id}/analytics`).expect(403);
  });
});
