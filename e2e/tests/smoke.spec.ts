import { expect, test } from '@playwright/test';
import { trackConsoleProblems } from './helpers.js';

// These tests run signed in, as the user created by auth.setup.ts.

test('landing page renders without console errors', async ({ page }) => {
  const problems = trackConsoleProblems(page);

  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page).toHaveTitle(/Formyx/);
  expect(problems).toEqual([]);
});

test('API health is reachable through the web dev proxy', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ status: 'ok' });
});

test('theme choice persists across reloads', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Change theme' }).click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});

test('signed-in visitors go from the landing page straight into the app', async ({ page }) => {
  const problems = trackConsoleProblems(page);

  await page.goto('/');
  await page.getByRole('link', { name: 'Start for free' }).first().click();

  await expect(page).toHaveURL(/\/app\/forms$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Forms' })).toBeVisible();
  await expect(page).toHaveTitle('Forms · Formyx');
  expect(problems).toEqual([]);
});

test('mobile navigation opens in a sheet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'The sheet is only used below 768px');

  await page.goto('/app/forms');
  await page.getByRole('button', { name: 'Open navigation' }).click();

  const sheet = page.getByRole('dialog', { name: 'Navigation' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('link', { name: 'Members' }).click();

  await expect(page).toHaveURL(/\/app\/settings\/members$/);
  await expect(sheet).toBeHidden();
});

test('pages never scroll horizontally', async ({ page }) => {
  for (const path of ['/', '/app/forms', '/app/settings']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${path}`).toBe(0);
  }
});
