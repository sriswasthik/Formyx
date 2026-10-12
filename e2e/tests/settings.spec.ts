import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  createFormViaApi,
  latestEmailTo,
  publishViaApi,
  trackConsoleProblems,
  uniqueEmail,
} from './helpers.js';

// Sprint 14's settings on published forms: a password, one response per confirmed email
// address, changing a response through its private link, a form in Telugu and a prefilled
// link; and the settings page itself, which saves as things change.

const FIELDS = [
  { id: 'fld_name', type: 'short_text', label: 'Your name', required: true },
  {
    id: 'fld_size',
    type: 'single_choice',
    label: 'T-shirt size',
    required: true,
    options: [
      { id: 'opt_m', label: 'Medium' },
      { id: 'opt_l', label: 'Large' },
    ],
  },
];

const ACCESS = { oneResponsePer: 'off', requireEmail: false, allowEdits: false, unlisted: true };

/** A new published form with `FIELDS`, its access settings and draft settings as given. */
async function publishForm(
  page: Page,
  title: string,
  options: { access?: Partial<typeof ACCESS>; settings?: Record<string, unknown> } = {},
): Promise<{ formId: string; path: string }> {
  const formId = await createFormViaApi(page, 'blank');
  const current = await page.request.get(`/api/forms/${formId}`);
  const form = (await current.json()) as {
    version: number;
    draftSchema: { settings: Record<string, unknown> };
  };
  const saved = await page.request.patch(`/api/forms/${formId}`, {
    data: {
      version: form.version,
      title,
      draftSchema: {
        ...form.draftSchema,
        fields: FIELDS,
        settings: { ...form.draftSchema.settings, ...options.settings },
      },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  if (options.access) {
    const access = await page.request.patch(`/api/forms/${formId}/settings`, {
      data: { access: { ...ACCESS, ...options.access } },
    });
    expect(access.ok(), await access.text()).toBe(true);
  }
  return { formId, path: await publishViaApi(page, formId) };
}

/** A respondent of their own: no session, saved answers or counted visit from others. */
async function respondent(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return context.newPage();
}

/** Picks a radio the way people do: its input is drawn by its label. */
async function pick(page: Page, name: string) {
  const radio = page.getByRole('radio', { name, exact: true });
  await radio.locator('xpath=ancestor::label[1]').click();
  await expect(radio).toBeChecked();
}

async function answer(page: Page, name: string, size: string) {
  await page.getByRole('textbox', { name: /Your name/ }).fill(name);
  await pick(page, size);
}

test('asks for the password before showing anything', async ({ page, browser }) => {
  const { formId, path } = await publishForm(page, 'Staff party');
  const locked = await page.request.put(`/api/forms/${formId}/settings/password`, {
    data: { password: 'open sesame' },
  });
  expect(locked.ok()).toBe(true);

  const visitor = await respondent(browser);
  const problems = trackConsoleProblems(visitor);
  await visitor.goto(path);
  await expect(visitor.getByRole('heading', { level: 1, name: 'Staff party' })).toBeVisible();
  await expect(visitor.getByText('Enter the password you were given to open it.')).toBeVisible();
  await expect(visitor.getByRole('textbox', { name: /Your name/ })).toHaveCount(0);

  await visitor.getByLabel('Password').fill('guess');
  await visitor.getByRole('button', { name: 'Open the form' }).click();
  await expect(visitor.getByText('That password is not right.')).toBeVisible();

  await visitor.getByLabel('Password').fill('open sesame');
  await visitor.getByRole('button', { name: 'Open the form' }).click();
  await answer(visitor, 'Ada', 'Medium');
  await visitor.getByRole('button', { name: 'Submit' }).click();
  await expect(visitor.getByText('Thanks! Your response has been recorded.')).toBeVisible();

  // Problems the respondent was meant to see (the wrong password) are not console errors.
  expect(problems.filter((problem) => !problem.includes('400'))).toEqual([]);
});

test('takes one response per confirmed email address', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const { path } = await publishForm(page, 'Conference sign-up', {
    access: { oneResponsePer: 'email' },
  });
  const email = uniqueEmail('attendee');

  const visitor = await respondent(browser);
  await visitor.goto(path);
  await visitor.getByLabel('Email address').fill(email);
  await visitor.getByRole('button', { name: 'Continue' }).click();
  await expect(visitor.getByText(`We sent a 6-digit code to ${email}`)).toBeVisible();

  const message = await latestEmailTo(email);
  expect(message.subject).toBe('Your code for “Conference sign-up”');
  const code = /\b(\d{6})\b/.exec(message.text)?.[1] ?? '';
  await visitor.getByLabel('Code').fill(code === '000000' ? '111111' : '000000');
  await visitor.getByRole('button', { name: 'Confirm' }).click();
  await expect(visitor.getByText('That code is not right, or it has expired.')).toBeVisible();

  await visitor.getByLabel('Code').fill(code);
  await visitor.getByRole('button', { name: 'Confirm' }).click();
  await answer(visitor, 'Grace', 'Large');
  await visitor.getByRole('button', { name: 'Submit' }).click();
  await expect(visitor.getByText('Thanks! Your response has been recorded.')).toBeVisible();

  // The same address, from another browser: confirmed again, then turned away.
  const again = await respondent(browser);
  await again.goto(path);
  await again.getByLabel('Email address').fill(email.toUpperCase());
  await again.getByRole('button', { name: 'Continue' }).click();
  // A new code replaces the first: wait for its email.
  let secondCode = code;
  await expect
    .poll(async () => {
      secondCode = /\b(\d{6})\b/.exec((await latestEmailTo(email)).text)?.[1] ?? code;
      return secondCode;
    })
    .not.toBe(code);
  await again.getByLabel('Code').fill(secondCode);
  await again.getByRole('button', { name: 'Confirm' }).click();
  await expect(again.getByText('You have already responded')).toBeVisible();
  await expect(again.getByLabel('Code')).toHaveCount(0);
});

test('lets respondents change their response through its private link', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const { formId, path } = await publishForm(page, 'Team lunch', {
    access: { allowEdits: true },
  });

  const visitor = await respondent(browser);
  await visitor.goto(path);
  await answer(visitor, 'Ada', 'Medium');
  await visitor.getByRole('button', { name: 'Submit' }).click();
  const link = visitor.getByRole('textbox', { name: 'Change your response later' });
  const editUrl = await link.inputValue();
  expect(editUrl).toMatch(/#edit=[\w-]{20,}$/);

  const later = await respondent(browser);
  await later.goto(editUrl);
  await expect(later.getByText('Changing your response')).toBeVisible();
  await expect(later.getByRole('textbox', { name: /Your name/ })).toHaveValue('Ada');
  await pick(later, 'Large');
  await later.getByRole('button', { name: 'Save changes' }).click();
  await expect(later.getByText('Thanks! Your response has been recorded.')).toBeVisible();

  const list = await page.request.get(`/api/forms/${formId}/submissions`);
  const { submissions } = (await list.json()) as {
    submissions: { answers: Record<string, unknown>; editedAt?: string }[];
  };
  expect(submissions).toHaveLength(1);
  expect(submissions[0]?.answers.fld_size).toBe('opt_l');
  expect(submissions[0]?.editedAt).toBeTruthy();
});

test('speaks Telugu, and fills answers from a prefilled link', async ({ page, browser }) => {
  const { path } = await publishForm(page, 'పండుగ నమోదు', {
    settings: { language: 'te', submitButtonText: 'సమర్పించండి' },
  });

  const visitor = await respondent(browser);
  const problems = trackConsoleProblems(visitor);
  await visitor.goto(`${path}?fld_name=${encodeURIComponent('రాము')}&fld_size=Large`);
  await expect(visitor.locator('[lang="te-IN"]').first()).toBeVisible();
  await expect(visitor.getByRole('textbox', { name: /Your name/ })).toHaveValue('రాము');
  await expect(visitor.getByRole('radio', { name: 'Large', exact: true })).toBeChecked();

  // Checks are in Telugu too.
  await visitor.getByRole('textbox', { name: /Your name/ }).fill('');
  await visitor.getByRole('button', { name: 'సమర్పించండి' }).click();
  await expect(visitor.getByText('ఈ ప్రశ్నకు సమాధానం తప్పనిసరి')).toBeVisible();
  expect(problems).toEqual([]);
});

test('saves settings as they change, and finds them by search', async ({ page }) => {
  const { formId } = await publishForm(page, 'Settings tour');
  const problems = trackConsoleProblems(page);

  await page.goto(`/app/forms/${formId}/settings`);
  await expect(page.getByRole('heading', { level: 2, name: 'General' })).toBeVisible();

  await page.getByRole('combobox', { name: 'Search settings' }).fill('edit');
  await page.getByRole('option', { name: /Changing responses/ }).click();
  await expect(page).toHaveURL(/section=access&setting=edits/);

  const edits = page.getByRole('switch', { name: 'Changing responses' });
  await edits.click();
  await expect(page.getByRole('status').getByText('Saved')).toBeVisible();

  await page.getByRole('textbox', { name: 'Response limit' }).fill('ten');
  await expect(page.getByText('Enter a whole number')).toBeVisible();
  await page.getByRole('textbox', { name: 'Response limit' }).fill('10');
  await expect(page.getByRole('status').getByText('Saved')).toBeVisible();

  const settings = await page.request.get(`/api/forms/${formId}/settings`);
  const view = (await settings.json()) as {
    settings: { access: { allowEdits: boolean; responseLimit?: number } };
  };
  expect(view.settings.access).toMatchObject({ allowEdits: true, responseLimit: 10 });
  expect(problems).toEqual([]);
});
