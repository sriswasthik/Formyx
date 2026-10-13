import { expect, test, type Browser } from '@playwright/test';
import { E2E_PASSWORD, latestEmailTo, trackConsoleProblems, uniqueEmail } from './helpers.js';

/*
 * Sprint 20's paths in: the welcome after sign-up, a template from the public gallery, the
 * unsubscribe link in lifecycle emails, a friend's referral link, and the help centre.
 */

test.use({ storageState: { cookies: [], origins: [] } });

async function signedOut(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return context.newPage();
}

test('welcomes a new account and starts it on a template for what it is for', async ({ page }) => {
  const problems = trackConsoleProblems(page);
  await page.goto('/signup');
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  await page.getByLabel('Name').fill('Priya Raman');
  await page.getByLabel('Email').fill(uniqueEmail('welcome'));
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  const welcome = page.getByRole('dialog', { name: 'Welcome to Formyx, Priya' });
  await welcome.getByRole('radio', { name: /Feedback/ }).click();
  await welcome.getByRole('button', { name: 'Continue' }).click();
  const templates = page.getByRole('dialog', { name: 'Start from a template' });
  await expect(templates.getByRole('radio', { name: /Feedback survey/ })).toBeChecked();
  await templates.getByRole('button', { name: 'Create form' }).click();

  await expect(page.getByRole('textbox', { name: 'Form title' })).toHaveValue('Feedback survey', {
    timeout: 15_000,
  });
  await page.getByRole('link', { name: 'Back to all forms' }).click();
  const checklist = page.getByRole('region', { name: 'Get started with Formyx' });
  await expect(checklist.getByText('1 of 4 done')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(problems).toEqual([]);
});

test('a template from the gallery leads through sign-up to the form', async ({ page }) => {
  const problems = trackConsoleProblems(page);
  await page.goto('/templates/wedding-rsvp');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Wedding RSVP template' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Use this template' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();

  await page.getByLabel('Name').fill('Meera Iyer');
  await page.getByLabel('Email').fill(uniqueEmail('gallery'));
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('textbox', { name: 'Form title' })).toHaveValue('Wedding RSVP', {
    timeout: 15_000,
  });
  // They chose where to start already: no welcome on the way back.
  await page.getByRole('link', { name: 'Back to all forms' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Forms' })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(problems).toEqual([]);
});

test('the welcome email’s link stops tips and reminders, and can undo it', async ({
  page,
  browser,
}) => {
  const email = uniqueEmail('unsubscribe');
  const registered = await page.request.post('/api/auth/register', {
    data: { name: 'Kabir Shah', email, password: E2E_PASSWORD },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  const welcome = await latestEmailTo(email);
  expect(welcome.subject).toBe('Welcome to Formyx');
  const link = /https?:\/\/\S+\/unsubscribe\/[\w.-]+/.exec(welcome.text)?.[0] ?? '';
  expect(link).not.toBe('');

  const reader = await signedOut(browser);
  const problems = trackConsoleProblems(reader);
  await reader.goto(new URL(link).pathname);
  await expect(reader.getByRole('heading', { name: 'Stop tips and reminders?' })).toBeVisible();
  await reader.getByRole('button', { name: 'Unsubscribe' }).click();
  await expect(reader.getByRole('heading', { name: 'You’re unsubscribed' })).toBeVisible();
  await reader.getByRole('button', { name: 'Undo' }).click();
  await expect(reader.getByRole('heading', { name: 'You’re subscribed again' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('a friend’s referral link says who invited them', async ({ page, browser }) => {
  const registered = await page.request.post('/api/auth/register', {
    data: { name: 'Anjali Rao', email: uniqueEmail('referrer'), password: E2E_PASSWORD },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  const { code } = (await (await page.request.get('/api/referrals')).json()) as { code: string };

  const friend = await signedOut(browser);
  const problems = trackConsoleProblems(friend);
  await friend.goto(`/?ref=${code}`);
  await friend.getByRole('link', { name: 'Get started' }).first().click();
  await expect(friend.getByText('Anjali invited you.')).toBeVisible();
  await expect(friend.getByText(/starts with 60 days of Pro/)).toBeVisible();
  expect(problems).toEqual([]);
});

test('the help centre finds articles by search', async ({ page }) => {
  const problems = trackConsoleProblems(page);
  await page.goto('/help');
  await page.getByRole('searchbox', { name: 'Search help articles' }).fill('quiz');
  await page.getByRole('link', { name: /Make a quiz/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Make a quiz' })).toBeVisible();
  await expect(page).toHaveTitle('Make a quiz · Formyx');
  expect(problems).toEqual([]);
});
