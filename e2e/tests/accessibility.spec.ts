import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createFormViaApi, publishViaApi } from './helpers.js';

// Automated accessibility checks (axe) on the main pages, in light and dark, at both screen
// sizes. They catch what machines can: contrast, names, roles, landmarks. Keyboard use and
// screen-reader flows are covered by the other specs and by hand.

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({
      rule: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(' ')).slice(0, 5),
    }));
  expect(serious).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('landing page', async ({ browser }) => {
      // Signed out: the page visitors see.
      const context = await browser.newContext({
        colorScheme,
        storageState: { cookies: [], origins: [] },
      });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoSeriousViolations(page);
      await context.close();
    });

    test('forms dashboard', async ({ page }) => {
      await createFormViaApi(page, 'feedback_survey');
      await page.goto('/app/forms');
      await expect(page.getByRole('heading', { level: 1, name: 'Forms' })).toBeVisible();
      await expect(page.getByText('Feedback survey').first()).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('editor', async ({ page }) => {
      const formId = await createFormViaApi(page, 'event_registration');
      await page.goto(`/app/forms/${formId}/edit`);
      await expect(page.getByRole('textbox', { name: 'Form title' })).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('public form', async ({ page }) => {
      const formId = await createFormViaApi(page, 'event_registration');
      await page.goto(await publishViaApi(page, formId));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  });
}
