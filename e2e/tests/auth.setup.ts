import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test as setup } from '@playwright/test';
import {
  AUTH_CREDENTIALS_PATH,
  AUTH_STATE_PATH,
  E2E_PASSWORD,
  skipWelcome,
  trackConsoleProblems,
  uniqueEmail,
} from './helpers.js';

setup('sign up the shared test user', async ({ page }) => {
  const problems = trackConsoleProblems(page);
  const email = uniqueEmail('ada');

  await page.goto('/signup');
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/app\/forms$/);
  // Other tests start on the dashboard: without the welcome or the getting-started checklist.
  await skipWelcome(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Forms' })).toBeVisible();
  await page.getByRole('button', { name: 'Hide the getting-started checklist' }).click();
  await expect(page.getByRole('region', { name: 'Get started with Formyx' })).toBeHidden();
  expect(problems).toEqual([]);

  await mkdir(dirname(AUTH_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: AUTH_STATE_PATH });
  await writeFile(AUTH_CREDENTIALS_PATH, JSON.stringify({ email, password: E2E_PASSWORD }));
});
