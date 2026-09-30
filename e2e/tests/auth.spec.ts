import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  AUTH_CREDENTIALS_PATH,
  E2E_PASSWORD,
  fillLogIn,
  openSidebar,
  trackConsoleProblems,
  uniqueEmail,
} from './helpers.js';

// Every test here starts signed out.
test.use({ storageState: { cookies: [], origins: [] } });

async function sharedUserEmail(): Promise<string> {
  const { email } = JSON.parse(await readFile(AUTH_CREDENTIALS_PATH, 'utf8')) as { email: string };
  return email;
}

test('log-in and sign-up pages load cleanly and fit the screen', async ({ page }) => {
  const problems = trackConsoleProblems(page);

  for (const [path, heading] of [
    ['/login', 'Log in to Formyx'],
    ['/signup', 'Create your account'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page).toHaveTitle(path === '/login' ? 'Log in · Formyx' : 'Sign up · Formyx');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${path}`).toBe(0);
  }

  await page.getByRole('link', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(problems).toEqual([]);
});

test('sends signed-out visitors to log in, then on to the page they wanted', async ({ page }) => {
  await page.goto('/app/settings');
  await expect(page).toHaveURL(/\/login$/);

  await fillLogIn(page, await sharedUserEmail());

  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
});

test('shows inline errors instead of submitting an invalid form', async ({ page }) => {
  await page.goto('/signup');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Enter your name')).toBeVisible();
  await expect(page.getByLabel('Name')).toBeFocused();
  await expect(page).toHaveURL(/\/signup$/);
});

test('signs up, logs out and logs back in', async ({ page }, testInfo) => {
  const problems = trackConsoleProblems(page);
  const email = uniqueEmail('grace');

  await page.goto('/');
  await page.getByRole('link', { name: 'Get started' }).click();
  await page.getByLabel('Name').fill('Grace Hopper');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/app\/forms$/);
  const sidebar = await openSidebar(page, testInfo);
  await expect(
    sidebar.getByRole('button', { name: "Switch workspace, current workspace: Grace's workspace" }),
  ).toBeVisible();

  await sidebar.getByRole('button', { name: 'Account menu for Grace Hopper' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // The session is really gone, not just hidden.
  await page.goto('/app/forms');
  await expect(page).toHaveURL(/\/login$/);

  await fillLogIn(page, email);
  await expect(page).toHaveURL(/\/app\/forms$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Forms' })).toBeVisible();
  expect(problems).toEqual([]);
});
