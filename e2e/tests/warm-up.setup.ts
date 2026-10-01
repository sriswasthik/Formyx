import { expect, test as setup } from '@playwright/test';
import { AUTH_STATE_PATH, createFormViaApi, publishViaApi } from './helpers.js';

/*
 * The dev server compiles each page the first time it is asked for. Visiting the heaviest pages
 * once, before the tests start in parallel, keeps every test from paying for those compiles at
 * the same moment (which made the first ones time out on a cold start).
 */
setup.use({ storageState: AUTH_STATE_PATH });

setup('compile the main pages once', async ({ page }) => {
  setup.setTimeout(120_000);
  const formId = await createFormViaApi(page, 'feedback_survey');
  const publicPath = await publishViaApi(page, formId);

  await page.goto(`/app/forms/${formId}/edit`);
  await expect(page.getByRole('textbox', { name: 'Form title' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Accent colour' })).toBeVisible();

  await page.goto(`/app/forms/${formId}/responses`);
  await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible({ timeout: 60_000 });

  await page.goto('/app/settings/workspace');
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible({ timeout: 60_000 });

  await page.goto(publicPath);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
});
