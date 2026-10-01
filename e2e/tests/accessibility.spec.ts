import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createFormViaApi, publishViaApi } from './helpers.js';

// Automated accessibility checks (axe) on the main pages, in light and dark, at both screen
// sizes. They catch what machines can: contrast, names, roles, landmarks. Keyboard use and
// screen-reader flows are covered by the other specs and by hand.

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Waits until `content` is fully faded in: its opacity times that of every ancestor is 1.
 * Pages fade in once their animation code has loaded, which can take a while on a cold dev
 * server, and text part-way through a fade has less contrast than it settles on.
 */
async function expectFadedIn(content: Locator) {
  await expect
    .poll(() =>
      content.evaluate((element) => {
        let opacity = 1;
        for (let node: Element | null = element; node; node = node.parentElement) {
          opacity *= Number(getComputedStyle(node).opacity);
        }
        return opacity;
      }),
    )
    .toBe(1);
}

/**
 * Then waits until nothing else is moving (endless animations such as spinners aside) for a few
 * checks in a row, so content still to come in after `content` is not checked half-faded.
 */
async function waitForPageToSettle(page: Page) {
  await page.evaluate(() => {
    delete (window as Window & { calmChecks?: number }).calmChecks;
  });
  await page.waitForFunction(
    () => {
      const state = window as Window & { calmChecks?: number };
      const animating = document
        .getAnimations()
        .some(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getTiming().iterations !== Infinity,
        );
      const fading = [...document.querySelectorAll('[style*="opacity"]')].some((element) => {
        const opacity = Number(getComputedStyle(element).opacity);
        return opacity > 0 && opacity < 1;
      });
      state.calmChecks = animating || fading ? 0 : (state.calmChecks ?? 0) + 1;
      return state.calmChecks >= 3;
    },
    undefined,
    { polling: 100 },
  );
}

/** Checks the page once `content`, the part each test waits for, is fully shown. */
async function expectNoSeriousViolations(page: Page, content: Locator) {
  await expectFadedIn(content);
  await waitForPageToSettle(page);
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
      // The hero's last item to fade in.
      await expectNoSeriousViolations(page, page.getByRole('link', { name: 'Start building' }));
      await context.close();
    });

    test('forms dashboard', async ({ page }) => {
      await createFormViaApi(page, 'feedback_survey');
      await page.goto('/app/forms');
      await expect(page.getByRole('heading', { level: 1, name: 'Forms' })).toBeVisible();
      const form = page.getByText('Feedback survey').first();
      await expect(form).toBeVisible();
      await expectNoSeriousViolations(page, form);
    });

    test('editor', async ({ page }) => {
      const formId = await createFormViaApi(page, 'event_registration');
      await page.goto(`/app/forms/${formId}/edit`);
      const title = page.getByRole('textbox', { name: 'Form title' });
      await expect(title).toBeVisible();
      await expectNoSeriousViolations(page, title);
    });

    test('public form', async ({ page }) => {
      const formId = await createFormViaApi(page, 'event_registration');
      await page.goto(await publishViaApi(page, formId));
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible();
      await expectNoSeriousViolations(page, heading);
    });
  });
}
