import { expect, test, type Page } from '@playwright/test';
import {
  createFormViaApi,
  E2E_PASSWORD,
  latestEmailTo,
  publishViaApi,
  skipWelcome,
  trackConsoleProblems,
  uniqueEmail,
} from './helpers.js';

// Data rights, end to end: a copy of my data, deleting my account with a week to undo it,
// and a creator handling a respondent's request about theirs.

/** Signs up a fresh account in this browser, through the API. */
async function signUp(page: Page, prefix: string): Promise<string> {
  const email = uniqueEmail(prefix);
  const res = await page.request.post('/api/auth/register', {
    data: { name: 'Grace Hopper', email, password: E2E_PASSWORD },
  });
  expect(res.ok(), await res.text()).toBe(true);
  // The app looks for a session only once it knows this browser signed in.
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('formyx-signed-in', '1');
  });
  return email;
}

test.describe('my own data', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('downloads a copy of my data, then deletes the account and keeps it again', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One account flow is enough');
    const problems = trackConsoleProblems(page);
    const email = await signUp(page, 'privacy');

    await page.goto('/app/forms');
    await skipWelcome(page);
    await page.goto('/app/settings#your-data');
    await page.getByRole('button', { name: 'Request my data' }).click();
    const download = page.getByRole('link', { name: 'Download' });
    await expect(download).toBeVisible({ timeout: 20_000 });
    const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(file.suggestedFilename()).toMatch(/^formyx-data-\d{4}-\d{2}-\d{2}\.zip$/);
    expect((await latestEmailTo(email)).subject).toBe('Your Formyx data is ready');

    await page.getByRole('button', { name: 'Delete account' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete your account?' });
    await expect(dialog.getByText('Deleted with its forms and responses.')).toBeVisible();
    await dialog.getByLabel('Your password').fill(E2E_PASSWORD);
    await dialog.getByRole('button', { name: 'Delete account' }).click();
    // Signed out, with the date it goes.
    await expect(page.getByText(/Your account will be deleted on/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Delete account' })).toHaveCount(0);

    // The emailed link keeps it, without signing in.
    const mail = await latestEmailTo(email);
    expect(mail.subject).toBe('Your Formyx account will be deleted');
    const link = /https?:\/\/\S+\/account\/restore\?token=\S+/.exec(mail.text)?.[0] ?? '';
    await page.goto(new URL(link).pathname + new URL(link).search);
    await expect(page.getByRole('heading', { name: 'Your account is staying' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('shows a waiting account how to keep itself when it signs in', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One account flow is enough');
    const problems = trackConsoleProblems(page);
    const email = await signUp(page, 'keep');
    const deleted = await page.request.post('/api/account/delete', {
      data: { password: E2E_PASSWORD },
    });
    expect(deleted.status()).toBe(202);
    const login = await page.request.post('/api/auth/login', {
      data: { email, password: E2E_PASSWORD },
    });
    expect(login.ok()).toBe(true);

    await page.goto('/app/forms');
    await skipWelcome(page);
    const banner = page.getByRole('region', { name: 'Account deletion' });
    await expect(banner).toContainText('Your account will be deleted on');
    await banner.getByRole('button', { name: 'Keep my account' }).click();
    await expect(banner).toBeHidden();
    expect(problems).toEqual([]);
  });
});

test('finds and deletes a respondent’s responses by their email', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The settings flow is the same on every size');
  const problems = trackConsoleProblems(page);
  const formId = await createFormViaApi(page, 'blank');
  const form = (await (await page.request.get(`/api/forms/${formId}`)).json()) as {
    version: number;
    draftSchema: { fields: unknown[] };
  };
  const emailField = { id: 'fld_e2e_email', type: 'email', label: 'Your email', required: false };
  const patched = await page.request.patch(`/api/forms/${formId}`, {
    data: { version: form.version, draftSchema: { ...form.draftSchema, fields: [emailField] } },
  });
  expect(patched.ok()).toBe(true);
  const publicPath = await publishViaApi(page, formId);
  const respondent = uniqueEmail('respondent');
  const sent = await page.request.post(`/api/public/forms/${publicPath.slice(3)}/submissions`, {
    data: { answers: { fld_e2e_email: respondent } },
  });
  expect(sent.ok()).toBe(true);

  await page.goto('/app/settings/workspace');
  await page.getByLabel('Respondent’s email').fill(respondent.toUpperCase());
  await page.getByRole('button', { name: 'Find responses' }).click();
  await expect(page.getByText(`1 response holds ${respondent}.`)).toBeVisible();
  await page.getByRole('button', { name: 'Delete 1 response' }).click();
  await page.getByRole('button', { name: 'Delete responses' }).click();
  await expect(page.getByText('1 response deleted')).toBeVisible();
  await expect(page.getByText('No responses with this address')).toBeVisible();
  expect(problems).toEqual([]);
});
