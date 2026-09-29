import { expect, test, type Page } from '@playwright/test';

/** Collects console errors, warnings and uncaught exceptions for the page's lifetime. */
function trackConsoleProblems(page: Page) {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    problems.push(`pageerror: ${error.message}`);
  });
  return problems;
}

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

test('moves from the landing page into the app without console errors', async ({ page }) => {
  const problems = trackConsoleProblems(page);

  await page.goto('/');
  await page.getByRole('link', { name: 'Start building' }).click();

  await expect(page).toHaveURL(/\/forms$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Forms' })).toBeVisible();
  await expect(page).toHaveTitle('Forms · Formyx');
  expect(problems).toEqual([]);
});

test('mobile navigation opens in a sheet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'The sheet is only used below 768px');

  await page.goto('/forms');
  await page.getByRole('button', { name: 'Open navigation' }).click();

  const sheet = page.getByRole('dialog', { name: 'Navigation' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('link', { name: 'Settings' }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(sheet).toBeHidden();
});

test('pages never scroll horizontally', async ({ page }) => {
  for (const path of ['/', '/forms', '/settings']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${path}`).toBe(0);
  }
});
