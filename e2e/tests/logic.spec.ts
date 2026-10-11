import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  createFormViaApi,
  latestEmailTo,
  publishViaApi,
  trackConsoleProblems,
  uniqueEmail,
} from './helpers.js';

// Sprint 13's logic on published forms: a quiz with a jump to an end screen, end screens
// chosen by the server's mark, a redirect carrying answers, saving to finish later, and the
// drop-off funnel that the visits leave behind.

const option = (id: string, label: string) => ({ id, label });

/** Where the "skipped" end screen sends people; answered here, never fetched. */
const REDIRECT_URL = 'https://next.formyx-e2e.example/thanks';

const QUIZ_FIELDS = [
  { id: 'fld_name', type: 'short_text', label: 'Your name', required: true },
  {
    id: 'fld_capital',
    type: 'single_choice',
    label: 'What is the capital of France?',
    required: true,
    options: [option('opt_paris', 'Paris'), option('opt_rome', 'Rome')],
  },
  { id: 'fld_more', type: 'yes_no', label: 'Try the bonus question?', required: true },
  { id: 'fld_bonus_page', type: 'page_break', label: 'Bonus round', required: false },
  {
    id: 'fld_ocean',
    type: 'single_choice',
    label: 'Which ocean is the largest?',
    required: true,
    options: [option('opt_pacific', 'Pacific'), option('opt_atlantic', 'Atlantic')],
  },
];

const endScreen = (id: string, name: string, title: string) => ({
  id,
  name,
  title,
  message: '',
  align: 'center',
  showScore: true,
  when: [],
  match: 'all',
});

const QUIZ_LOGIC = {
  pages: {
    start: {
      title: 'About you',
      jumps: [
        {
          id: 'jmp_skip',
          when: [{ kind: 'answer', sourceFieldId: 'fld_more', operator: 'equals', value: 'no' }],
          match: 'all',
          to: { kind: 'end', endScreenId: 'end_skipped' },
        },
      ],
    },
  },
  variables: [],
  rules: [],
  quiz: {
    enabled: true,
    answers: {
      fld_capital: { correct: ['opt_paris'], points: 5 },
      fld_ocean: { correct: ['opt_pacific'], points: 5 },
    },
    passPercent: 60,
    showScore: true,
    revealAnswers: true,
  },
  endScreens: [
    endScreen('end_default', 'Default', 'Not quite, {{field:fld_name}}'),
    {
      ...endScreen('end_passed', 'Passed', 'Well done, {{field:fld_name}}!'),
      when: [{ kind: 'quiz', result: 'passed' }],
    },
    {
      ...endScreen('end_skipped', 'Skipped', 'See you next time'),
      redirect: {
        url: REDIRECT_URL,
        delaySeconds: 0,
        params: [{ name: 'name', source: { kind: 'answer', fieldId: 'fld_name' } }],
      },
    },
  ],
};

/** Saves `fields` and `logic` (and any settings) to a new blank form, publishes it. */
async function publishForm(
  page: Page,
  title: string,
  schema: { fields: unknown[]; logic?: unknown; settings?: Record<string, unknown> },
): Promise<{ formId: string; path: string }> {
  const formId = await createFormViaApi(page, 'blank');
  const current = await page.request.get(`/api/forms/${formId}`);
  const form = (await current.json()) as {
    version: number;
    draftSchema: { settings: Record<string, unknown>; logic: unknown };
  };
  const saved = await page.request.patch(`/api/forms/${formId}`, {
    data: {
      version: form.version,
      title,
      draftSchema: {
        ...form.draftSchema,
        fields: schema.fields,
        logic: schema.logic ?? form.draftSchema.logic,
        settings: { ...form.draftSchema.settings, ...schema.settings },
      },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return { formId, path: await publishViaApi(page, formId) };
}

/** A respondent of their own: no session, saved answers or counted visit from others. */
async function respondent(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return context.newPage();
}

/** Opens a public form and waits for the visit to be counted. */
async function openForm(page: Page, path: string) {
  const counted = page.waitForResponse(
    (response) => response.url().endsWith('/view') && response.request().method() === 'POST',
  );
  await page.goto(path);
  expect((await counted).status()).toBe(201);
}

/** Picks a radio the way people do: its input is drawn by its label. */
async function pick(page: Page, name: string) {
  const radio = page.getByRole('radio', { name, exact: true });
  await radio.locator('xpath=ancestor::label[1]').click();
  await expect(radio).toBeChecked();
}

test('marks a quiz on the server, follows jumps to end screens and counts drop-off', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const { formId, path } = await publishForm(page, 'Capitals quiz', {
    fields: QUIZ_FIELDS,
    logic: QUIZ_LOGIC,
  });

  // One respondent takes the bonus page and passes; the score comes from the server.
  const passer = await respondent(browser);
  const problems = trackConsoleProblems(passer);
  await openForm(passer, path);
  await expect(passer.getByRole('heading', { name: 'About you' })).toBeVisible();
  await passer.getByRole('textbox', { name: 'Your name' }).fill('Asha');
  await pick(passer, 'Paris');
  await pick(passer, 'Yes');
  await passer.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(passer.getByRole('heading', { name: 'Bonus round' })).toBeVisible();
  await pick(passer, 'Pacific');
  await passer.getByRole('button', { name: 'Submit', exact: true }).click();

  const passed = passer.locator('[data-end-screen="end_passed"]');
  await expect(passed.getByRole('heading', { name: 'Well done, Asha!' })).toBeVisible();
  await expect(passed.locator('[data-quiz-score]')).toHaveText(/10 out of 10\s*\(100%\)/);
  await expect(passed).toContainText('You passed.');
  const review = passed.getByRole('region', { name: 'Your answers' });
  await expect(review.getByRole('listitem')).toHaveCount(2);
  expect(problems).toEqual([]);
  await passer.context().close();

  // Another skips the bonus: the jump ends the form there, and the redirect carries the name.
  const skipper = await respondent(browser);
  await skipper.route(`${REDIRECT_URL}**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Next</title><h1>Next step</h1>' }),
  );
  await openForm(skipper, path);
  await skipper.getByRole('textbox', { name: 'Your name' }).fill('Ravi Kumar');
  await pick(skipper, 'Rome');
  await pick(skipper, 'No');
  // The route ends on this page, so it sends rather than moving on.
  await expect(skipper.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);
  await skipper.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(skipper).toHaveURL(`${REDIRECT_URL}?name=Ravi+Kumar`);
  await expect(skipper.getByRole('heading', { name: 'Next step' })).toBeVisible();
  await skipper.context().close();

  // A third only looks.
  const visitor = await respondent(browser);
  await openForm(visitor, path);
  await visitor.context().close();

  // The funnel: three opened, one reached the bonus page (the jump took another past it)
  // and two sent a response.
  await page.goto(`/app/forms/${formId}/responses?tab=summary`);
  const dropOff = page.getByRole('region', { name: 'Drop-off' });
  await expect(dropOff).toContainText('The biggest drop is before Bonus round: 2 visits left.');
  const steps = dropOff.getByRole('list', { name: 'Visits reaching each step' });
  await expect(steps.getByRole('listitem').filter({ hasText: 'Bonus round' })).toHaveAttribute(
    'data-biggest-drop',
    'true',
  );
  await expect(steps.getByRole('listitem').filter({ hasText: 'Sent a response' })).toContainText(
    '67%',
  );

  // Each response keeps the end screen and mark the server worked out.
  await page.goto(`/app/forms/${formId}/responses?tab=responses`);
  await page
    .getByRole('row')
    .filter({ hasText: 'Asha' })
    .getByRole('button', { name: /^Open the response from/ })
    .click();
  const outcome = page.getByRole('region', { name: 'Outcome' });
  await expect(outcome).toContainText('End screenPassed');
  await expect(outcome).toContainText('Quiz score10 out of 10 (100%), passed');
});

test('keeps answers in the browser and emails a link to finish later', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const { path } = await publishForm(page, 'Order form', {
    fields: [
      { id: 'fld_name', type: 'short_text', label: 'Your name', required: true },
      { id: 'fld_order_page', type: 'page_break', label: 'Your order', required: false },
      {
        id: 'fld_size',
        type: 'single_choice',
        label: 'Which size?',
        required: true,
        options: [option('opt_small', 'Small'), option('opt_large', 'Large')],
      },
    ],
    settings: { saveProgress: 'email' },
  });

  const first = await respondent(browser);
  const problems = trackConsoleProblems(first);
  await openForm(first, path);
  await first.getByRole('textbox', { name: 'Your name' }).fill('Meera');
  await first.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(first.getByRole('heading', { name: 'Your order' })).toBeVisible();

  // Answers stay in this browser: a reload comes back to them.
  await first.reload();
  await expect(first.getByText('Welcome back: your answers are as you left them.')).toBeVisible();
  await expect(first.getByRole('heading', { name: 'Your order' })).toBeVisible();

  // And a link by email takes them anywhere.
  const email = uniqueEmail('resume');
  await first.getByRole('button', { name: 'Save and continue later' }).click();
  await first.getByRole('textbox', { name: 'Email me a link to finish later' }).fill(email);
  await first.getByRole('button', { name: 'Send link' }).click();
  await expect(
    first.getByRole('status').filter({ hasText: `We sent a link to ${email}` }),
  ).toBeVisible();
  expect(problems).toEqual([]);
  await first.context().close();

  const message = await latestEmailTo(email);
  const link = /https?:\/\/\S+#resume=[\w-]{43}/.exec(message.text)?.[0] ?? '';
  expect(link).not.toBe('');
  const { pathname, hash } = new URL(link);
  expect(pathname).toBe(path);

  const later = await respondent(browser);
  await later.goto(`${pathname}${hash}`);
  await expect(later.getByText('Welcome back: your answers are as you left them.')).toBeVisible();
  await expect(later.getByRole('heading', { name: 'Your order' })).toBeVisible();
  // The token leaves the address bar once read.
  expect(new URL(later.url()).hash).toBe('');
  await later.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(later.getByRole('textbox', { name: 'Your name' })).toHaveValue('Meera');
  await later.getByRole('button', { name: 'Next', exact: true }).click();
  await pick(later, 'Large');
  await later.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(later.locator('[data-end-screen="end_default"]')).toBeVisible();
  await later.context().close();
});
