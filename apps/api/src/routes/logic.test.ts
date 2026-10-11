import {
  apiErrorSchema,
  createEmptyForm,
  createEndScreen,
  createField,
  createJump,
  createRule,
  draftResponseSchema,
  formAnalyticsSchema,
  formDetailSchema,
  publicFormResponseSchema,
  submissionResponseSchema,
  viewResponseSchema,
  type FormSchema,
  type QuizSettings,
} from '@formyx/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../services/public-form-service.js';
import { createFakeMailer, createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createPublishedForm } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

/*
 * A two-question quiz over three pages. Page 1: name. Page 2: the capital of India; a wrong
 * answer jumps to the "Try again" end screen. Page 3: a required bonus question. A right
 * answer adds 10 to a score; passing (50%) shows the "Passed" end screen.
 */
const name = { ...createField('short_text'), id: 'name', label: 'Name', required: true };
const quizPage = { ...createField('page_break'), id: 'quiz', label: 'Quiz' };
const capital = {
  ...createField('single_choice'),
  id: 'capital',
  label: 'Capital of India?',
  required: true,
  options: [
    { id: 'mumbai', label: 'Mumbai' },
    { id: 'delhi', label: 'New Delhi' },
  ],
};
const bonusPage = { ...createField('page_break'), id: 'bonus_page', label: 'Bonus' };
const bonus = {
  ...createField('short_text'),
  id: 'bonus',
  label: 'Longest river?',
  required: true,
};

const base = createEmptyForm();
const quizSettings: QuizSettings = {
  enabled: true,
  answers: {
    capital: { correct: ['delhi'], points: 5 },
    bonus: { correct: ['Ganga', 'Ganges'], points: 5 },
  },
  passPercent: 50,
  showScore: true,
  revealAnswers: true,
};
const QUIZ: FormSchema = {
  ...base,
  fields: [name, quizPage, capital, bonusPage, bonus],
  logic: {
    ...base.logic,
    variables: [{ id: 'points', name: 'Points', kind: 'score', initial: 0 }],
    rules: [
      {
        ...createRule('points'),
        when: [{ kind: 'answer', sourceFieldId: 'capital', operator: 'equals', value: 'delhi' }],
        amount: { kind: 'number', value: 10 },
      },
    ],
    pages: {
      quiz: {
        jumps: [
          {
            ...createJump({ kind: 'end', endScreenId: 'retry' }),
            when: [
              { kind: 'answer', sourceFieldId: 'capital', operator: 'equals', value: 'mumbai' },
            ],
          },
        ],
      },
    },
    quiz: quizSettings,
    endScreens: [
      ...base.logic.endScreens,
      createEndScreen({
        id: 'passed',
        name: 'Passed',
        message: 'Well done, {{field:name}}: {{var:quiz_score}} points.',
        when: [{ kind: 'quiz', result: 'passed' }],
      }),
      createEndScreen({ id: 'retry', name: 'Try again', message: 'Not quite. Try again?' }),
    ],
  },
};

const app = createTestApp();
let team: Team;
const formUrl = (slug: string) => `/api/public/forms/${slug}`;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

const submit = (slug: string, body: object) =>
  request(app)
    .post(`${formUrl(slug)}/submissions`)
    .send(body);

describe('quizzes and outcomes', () => {
  it('never sends the right answers to respondents', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, QUIZ);
    const res = await request(app).get(formUrl(form.slug)).expect(200);
    const published = publicFormResponseSchema.parse(res.body);
    if (published.status !== 'open') throw new Error('Expected an open form');
    expect(published.schema.logic.quiz).toMatchObject({ enabled: true, answers: {} });
    expect(JSON.stringify(res.body)).not.toContain('Ganges');
  });

  it('marks the quiz and picks the end screen itself, ignoring totals the browser sends', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, QUIZ);
    const res = await submit(form.slug, {
      answers: { name: 'Ada', capital: 'delhi', bonus: 'Yamuna' },
      // A tampered browser cannot set its own result.
      outcome: { endScreenId: 'passed', values: { points: 1000 } },
      score: 100,
    }).expect(201);

    const { outcome, id } = submissionResponseSchema.parse(res.body);
    expect(outcome).toEqual({
      endScreenId: 'passed',
      values: { points: 10, quiz_score: 5, quiz_percent: 50 },
      quiz: {
        score: 5,
        max: 10,
        percent: 50,
        passed: true,
        review: [
          { fieldId: 'capital', correct: true, answered: true, points: 5, expected: ['delhi'] },
          {
            fieldId: 'bonus',
            correct: false,
            answered: true,
            points: 5,
            expected: ['Ganga', 'Ganges'],
          },
        ],
      },
    });
    // Stored without the review.
    const stored = await prisma.submission.findUniqueOrThrow({
      where: { id },
      select: { outcome: true },
    });
    expect(stored.outcome).toEqual({
      endScreenId: 'passed',
      values: { points: 10, quiz_score: 5, quiz_percent: 50 },
      quiz: { score: 5, max: 10, percent: 50, passed: true },
    });
  });

  it('follows the jump, dropping answers on skipped pages and waiving their questions', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, QUIZ);
    // The bonus is required, but a wrong answer jumps past it; its answer is dropped.
    const res = await submit(form.slug, {
      answers: { name: 'Ada', capital: 'mumbai', bonus: 'Ganga' },
    }).expect(201);
    const { outcome, id } = submissionResponseSchema.parse(res.body);
    expect(outcome).toMatchObject({
      endScreenId: 'retry',
      quiz: { score: 0, max: 5, percent: 0, passed: false },
    });
    const stored = await prisma.submission.findUniqueOrThrow({ where: { id } });
    expect(stored.answers).toEqual({ name: 'Ada', capital: 'mumbai' });

    // On the right path, the bonus is required.
    const refused = await submit(form.slug, { answers: { name: 'Ada', capital: 'delhi' } }).expect(
      400,
    );
    expect(apiErrorSchema.parse(refused.body).error.details).toEqual([
      { path: 'answers.bonus', message: 'This question is required' },
    ]);
  });

  it('keeps the review to itself unless the form reveals the answers', async () => {
    const quiet: FormSchema = {
      ...QUIZ,
      logic: { ...QUIZ.logic, quiz: { ...quizSettings, revealAnswers: false } },
    };
    const form = await createPublishedForm(prisma, team.workspaceId, quiet);
    const res = await submit(form.slug, {
      answers: { name: 'Ada', capital: 'delhi', bonus: 'Ganga' },
    }).expect(201);
    const { outcome } = submissionResponseSchema.parse(res.body);
    expect(outcome.quiz).toEqual({ score: 10, max: 10, percent: 100, passed: true });
  });

  it('answers bots caught by the honeypot with an outcome too, storing nothing', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, QUIZ);
    const res = await submit(form.slug, {
      answers: { name: 'Bot', capital: 'mumbai' },
      website: 'https://spam.example',
    }).expect(201);
    expect(submissionResponseSchema.parse(res.body).outcome.endScreenId).toBe('retry');
    expect(await prisma.submission.count()).toBe(0);
  });
});

describe('drop-off', () => {
  async function startVisit(slug: string): Promise<string> {
    const res = await request(app)
      .post(`${formUrl(slug)}/view`)
      .expect(201);
    return viewResponseSchema.parse(res.body).token;
  }
  const progress = (slug: string, body: object) =>
    request(app)
      .post(`${formUrl(slug)}/progress`)
      .send(body)
      .expect(204);
  const visitOf = (token: string) => prisma.formView.findUniqueOrThrow({ where: { token } });

  it('records how far a visit got, only ever forward', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, QUIZ);
    const token = await startVisit(form.slug);

    await progress(form.slug, { token, pageKey: 'quiz', fieldId: 'capital' });
    await progress(form.slug, { token, pageKey: 'start', fieldId: 'name' });
    await progress(form.slug, { token, pageKey: 'gone', fieldId: 'gone' });
    expect(await visitOf(token)).toMatchObject({ furthestPage: 'quiz', furthestField: 'capital' });

    // Someone else's token or form changes nothing.
    const other = await createPublishedForm(prisma, team.workspaceId, QUIZ, 'Other');
    await progress(other.slug, { token, pageKey: 'bonus_page' });
    await progress(form.slug, { token: 'x'.repeat(32), pageKey: 'bonus_page' });
    expect((await visitOf(token)).furthestPage).toBe('quiz');
  });

  it('marks the visit finished when its response arrives, and stops listening then', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, QUIZ);
    const token = await startVisit(form.slug);
    await submit(form.slug, {
      answers: { name: 'Ada', capital: 'mumbai' },
      viewToken: token,
    }).expect(201);
    // Moved on to where its route ended (a jump from the quiz page), in case the browser's
    // last reports were lost.
    const finished = await visitOf(token);
    expect(finished.completedAt).not.toBeNull();
    expect(finished).toMatchObject({ furthestPage: 'quiz', furthestField: 'capital' });

    await progress(form.slug, { token, pageKey: 'bonus_page' });
    expect((await visitOf(token)).furthestPage).toBe('quiz');
  });

  it('shows the funnel in analytics', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, QUIZ);
    for (const page of ['start', 'quiz', 'quiz', 'bonus_page']) {
      const token = await startVisit(form.slug);
      await progress(form.slug, { token, pageKey: page });
    }
    const finished = await startVisit(form.slug);
    await submit(form.slug, {
      answers: { name: 'Ada', capital: 'delhi', bonus: 'Ganga' },
      viewToken: finished,
    }).expect(201);
    // Visits from before tokens are left out.
    await prisma.formView.create({ data: { formId: form.id } });

    const res = await requestAs(app, team.users.VIEWER)
      .get(`/api/forms/${form.id}/analytics?range=30d&tz=UTC`)
      .expect(200);
    expect(formAnalyticsSchema.parse(res.body).dropOff).toEqual({
      unit: 'page',
      started: 5,
      steps: [
        { key: 'start', label: 'Page 1', reached: 5 },
        { key: 'quiz', label: 'Quiz', reached: 4 },
        { key: 'bonus_page', label: 'Bonus', reached: 2 },
      ],
      completed: 1,
    });
  });
});

describe('save and continue later', () => {
  const withEmail: FormSchema = { ...QUIZ, settings: { ...QUIZ.settings, saveProgress: 'email' } };
  const answers = { name: 'Ada', capital: 'delhi' };
  const state = { pageKey: 'quiz', seed: 'abc' };

  it('is refused unless the form offers it', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, QUIZ);
    const res = await request(app)
      .post(`${formUrl(form.slug)}/drafts`)
      .send({ email: 'ada@example.com', answers, state })
      .expect(403);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('DRAFTS_OFF');
  });

  it('emails a link to the saved answers, keeping only a hash of its token', async () => {
    const mailer = createFakeMailer();
    const mailingApp = createTestApp({}, { mailer });
    const form = await createPublishedForm(prisma, team.workspaceId, withEmail);
    await request(mailingApp)
      .post(`${formUrl(form.slug)}/drafts`)
      .send({ email: 'ada@example.com', answers: { ...answers, unknown: 'x' }, state })
      .expect(202);

    const [message] = mailer.sent[0]?.messages ?? [];
    expect(message?.to).toBe('ada@example.com');
    const link = /https:\/\/app\.formyx\.test\/f\/[^\s#]+#resume=([A-Za-z0-9_-]{43})/.exec(
      message?.text ?? '',
    );
    const token = link?.[1] ?? '';
    expect(token).toHaveLength(43);

    const [draft] = await prisma.formDraft.findMany();
    expect(draft?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(draft)).not.toContain(token);
    expect(JSON.stringify(draft)).not.toContain('ada@example.com');

    const resumed = await request(mailingApp)
      .post(`${formUrl(form.slug)}/drafts/resume`)
      .send({ token })
      .expect(200);
    expect(draftResponseSchema.parse(resumed.body)).toEqual({ answers, state });

    // Finishing the form uses the link up.
    await submit(form.slug, {
      answers: { ...answers, bonus: 'Ganga' },
      resumeToken: token,
    }).expect(201);
    await request(mailingApp)
      .post(`${formUrl(form.slug)}/drafts/resume`)
      .send({ token })
      .expect(404);
  });

  it('refuses unknown and expired links', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, withEmail);
    const token = 'a'.repeat(43);
    await prisma.formDraft.create({
      data: {
        formId: form.id,
        tokenHash: hashToken(token),
        answers,
        state,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await request(app)
      .post(`${formUrl(form.slug)}/drafts/resume`)
      .send({ token })
      .expect(404);
    await request(app)
      .post(`${formUrl(form.slug)}/drafts/resume`)
      .send({ token: 'b'.repeat(43) })
      .expect(404);
    await request(app)
      .post(`${formUrl(form.slug)}/drafts/resume`)
      .send({ token: 'short' })
      .expect(400);
  });
});

describe('logic in exports and plans', () => {
  it('exports the quiz score, values and end screen', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, QUIZ);
    await submit(form.slug, { answers: { name: 'Ada', capital: 'delhi', bonus: 'Ganga' } }).expect(
      201,
    );
    const res = await requestAs(app, team.users.VIEWER)
      .get(`/api/forms/${form.id}/submissions/export`)
      .expect(200);
    const [header, row] = res.text
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(header).toContain(
      'Quiz score,Quiz points possible,Quiz score (%),Passed,Points,End screen',
    );
    expect(row).toContain('10,10,100,Yes,10,Passed');
  });

  it('needs the plan to publish jumps and quizzes', async () => {
    const enforced = createTestApp({ ENTITLEMENTS_MODE: 'enforced' });
    const editor = requestAs(enforced, team.users.EDITOR);
    const created = await editor
      .post(`/api/workspaces/${team.workspaceId}/forms`, { title: 'Quiz' })
      .expect(201);
    const { id } = formDetailSchema.parse(created.body);
    await editor.patch(`/api/forms/${id}`, { version: 1, draftSchema: QUIZ }).expect(200);
    const res = await editor.post(`/api/forms/${id}/publish`, { version: 2 }).expect(403);
    expect(apiErrorSchema.parse(res.body).error).toMatchObject({
      code: 'UPGRADE_REQUIRED',
      details: { features: ['advanced_logic', 'quiz_mode'] },
    });
  });
});
