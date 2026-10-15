import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { E2E_PASSWORD, skipWelcome, trackConsoleProblems, uniqueEmail } from './helpers.js';

// The whole story, as a new user lives it: sign up, build a form from a template with a
// conditional question, publish it, receive a response from someone else live, export it.

const HEARD = 'How did you hear about the event?';
const REFERRER = 'Who referred you?';

test('signs up, builds a form with logic, publishes, gets a live response and exports it', async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile',
    'Phones edit with tabs (editor.spec.ts); the respondent below is on a phone',
  );
  test.setTimeout(90_000);

  // A brand-new person, signed out.
  const owner = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await owner.newPage();
  const problems = trackConsoleProblems(page);
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Jordan Lee');
  await page.getByLabel('Email').fill(uniqueEmail('journey'));
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app\/forms$/);
  await skipWelcome(page);

  // A form from a template.
  // A new workspace has no forms yet: its empty state leads to the templates.
  await page.getByRole('button', { name: 'Browse templates' }).click();
  const dialog = page.getByRole('dialog', { name: 'New form' });
  await dialog.getByRole('radio', { name: /Event registration/ }).click();
  await dialog.getByRole('button', { name: 'Create form' }).click();
  await expect(page.getByRole('textbox', { name: 'Form title' })).toHaveValue(
    'Event registration',
    { timeout: 15_000 },
  );

  // A new question, shown only to people a friend sent.
  await page.getByRole('button', { name: 'Add short text' }).click();
  await page.getByRole('textbox', { name: 'Question', exact: true }).fill(REFERRER);
  await page.getByRole('button', { name: 'Add condition' }).click();
  await page.getByRole('combobox', { name: 'Condition 1: question' }).click();
  await page.getByRole('option', { name: new RegExp(`${HEARD.replace('?', '\\?')}$`) }).click();
  await page.getByRole('combobox', { name: 'Condition 1: value' }).click();
  await page.getByRole('option', { name: 'A friend or colleague' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeAttached({ timeout: 10_000 });

  // Publish, and take the public link from the share dialog.
  await page.getByRole('button', { name: 'Publish' }).click();
  const share = page.getByRole('dialog', { name: 'Your form is live' });
  const link = await share.getByRole('textbox', { name: 'Public link' }).inputValue();
  await share.getByRole('button', { name: 'Done' }).click();

  // Watch for responses.
  await page.getByRole('link', { name: 'Responses' }).first().click();
  await page.getByRole('tab', { name: /^Responses/ }).click();
  await expect(page.getByText('No responses yet', { exact: true })).toBeVisible();

  // Someone else, on a phone, answers.
  const respondentContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
    hasTouch: true,
  });
  const respondent = await respondentContext.newPage();
  const respondentProblems = trackConsoleProblems(respondent);
  await respondent.goto(link);
  await respondent.getByRole('textbox', { name: /Full name/ }).fill('Ada Lovelace');
  // The template's look numbers its questions ("2. Email"); it has one email question.
  await respondent.getByRole('textbox', { name: /Email/ }).fill('ada@example.com');
  await respondent
    .getByRole('group', { name: /Which sessions will you attend/ })
    .getByText('Opening keynote')
    .click();
  await expect(respondent.getByRole('textbox', { name: REFERRER })).toHaveCount(0);
  await respondent.getByRole('group', { name: HEARD }).getByText('A friend or colleague').click();
  await respondent.getByRole('textbox', { name: REFERRER }).fill('Grace Hopper');
  await respondent.getByRole('button', { name: 'Register' }).click();
  await expect(respondent.getByText(/You're registered!/)).toBeVisible();
  await respondentContext.close();

  // It arrives without a reload.
  const row = page.getByRole('row').filter({ hasText: 'Grace Hopper' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Ada Lovelace');

  // And exports.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: 'CSV' }).click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), 'utf8');
  // The export starts with a byte-order mark, for Excel.
  const BOM = String.fromCharCode(0xfeff);
  const text = csv.startsWith(BOM) ? csv.slice(1) : csv;
  const [header = '', ...rows] = text.trim().split(/\r?\n/);
  expect(header).toContain(REFERRER);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toContain('Grace Hopper');

  expect(problems).toEqual([]);
  expect(respondentProblems).toEqual([]);
  await owner.close();
});
