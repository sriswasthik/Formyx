import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { applyPreset, createFormViaApi, openSidebar, publishViaApi } from './helpers.js';

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
 * Opacity set inline counts as moving while it changes: themed backgrounds keep shapes and
 * textures part-transparent for good.
 */
async function waitForPageToSettle(page: Page) {
  await page.evaluate(() => {
    const state = window as Window & { calmChecks?: number; lastOpacities?: string };
    delete state.calmChecks;
    delete state.lastOpacities;
  });
  await page.waitForFunction(
    () => {
      const state = window as Window & { calmChecks?: number; lastOpacities?: string };
      const animating = document
        .getAnimations()
        .some(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getTiming().iterations !== Infinity,
        );
      const opacities = [...document.querySelectorAll('[style*="opacity"]')]
        .map((element) => getComputedStyle(element).opacity)
        .join(',');
      const fading = opacities !== state.lastOpacities;
      state.lastOpacities = opacities;
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
      // The editor picture loads after the hero.
      await expectNoSeriousViolations(page, page.getByRole('img', { name: /The Formyx editor/ }));
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

/** A published form with a few answers in, for the pages that show responses. */
async function formWithResponses(page: Page): Promise<string> {
  const formId = await createFormViaApi(page, 'feedback_survey');
  const path = await publishViaApi(page, formId);
  const slug = path.replace('/f/', '');
  const form = (await (await page.request.get(`/api/public/forms/${slug}`)).json()) as {
    schema: { fields: { id: string; type: string; required?: boolean }[] };
  };
  const text = form.schema.fields.find(
    (field) => field.type === 'short_text' || field.type === 'long_text',
  );
  for (const answer of ['Lovely', 'Too long']) {
    await page.request.post(`/api/public/forms/${slug}/view`);
    await page.request.post(`/api/public/forms/${slug}/submissions`, {
      data: { answers: text ? { [text.id]: answer } : {} },
    });
  }
  return formId;
}

// Phase 2's screens: the Design Studio, logic, settings, integrations, responses with the
// drop-off funnel, preferences, feedback, the changelog and themed public forms.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Phase 2 screens, ${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('Design Studio, every section', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile', 'The panel layout is the desktop editor');
      // Six sections, each checked once it settles.
      test.setTimeout(120_000);
      const formId = await createFormViaApi(page, 'feedback_survey');
      await page.goto(`/app/forms/${formId}/edit`);
      await page.getByRole('tab', { name: 'Design' }).click();
      for (const section of [
        'Presets',
        'Background',
        'Colours',
        'Typography',
        'Components',
        'Layout',
      ]) {
        await page.getByRole('tab', { name: section }).click();
        const panel = page.getByRole('tabpanel', { name: section });
        await expect(panel).toBeVisible();
        await expectNoSeriousViolations(page, panel);
      }
    });

    test('Logic panel', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile', 'The panel layout is the desktop editor');
      const formId = await createFormViaApi(page, 'feedback_survey');
      await page.goto(`/app/forms/${formId}/edit`);
      await page.getByRole('tab', { name: 'Logic' }).click();
      const panel = page.getByRole('tabpanel', { name: 'Logic' });
      await expect(panel).toBeVisible();
      await expectNoSeriousViolations(page, panel);
    });

    test('form settings and integrations', async ({ page }) => {
      const formId = await createFormViaApi(page, 'feedback_survey');
      await page.goto(`/app/forms/${formId}/settings`);
      const settings = page.getByRole('heading', { level: 2 }).first();
      await expect(settings).toBeVisible();
      await expectNoSeriousViolations(page, settings);

      await page.goto(`/app/forms/${formId}/integrations`);
      const integrations = page.getByRole('heading', { name: 'Integrations', exact: true });
      await expect(integrations).toBeVisible();
      await expectNoSeriousViolations(page, page.getByRole('article', { name: /Google Sheets/ }));
    });

    test('responses with the drop-off funnel', async ({ page }) => {
      const formId = await formWithResponses(page);
      await page.goto(`/app/forms/${formId}/responses`);
      const table = page.getByRole('table').first();
      await expect(table).toBeVisible();
      await expectNoSeriousViolations(page, table);
    });

    test('preferences and the feedback dialog', async ({ page }, testInfo) => {
      await page.goto('/app/settings');
      const privacy = page.getByText('Share feature usage');
      await expect(privacy).toBeVisible();
      await expectNoSeriousViolations(page, privacy);

      const sidebar = await openSidebar(page, testInfo);
      await sidebar.getByRole('button', { name: 'Feedback' }).click();
      const dialog = page.getByRole('dialog', { name: 'Send feedback' });
      await expect(dialog).toBeVisible();
      await expectNoSeriousViolations(page, dialog);
    });

    test('changelog', async ({ browser }) => {
      const context = await browser.newContext({
        colorScheme,
        storageState: { cookies: [], origins: [] },
      });
      const page = await context.newPage();
      await page.goto('/changelog');
      const heading = page.getByRole('heading', { level: 1, name: 'Changelog' });
      await expect(heading).toBeVisible();
      await expectNoSeriousViolations(page, heading);
      await context.close();
    });

    test('public forms with expressive presets', async ({ page }) => {
      test.setTimeout(120_000);
      // A mesh with a display font, shapes on a pastel ground, and a dark grid.
      for (const preset of ['Sunrise mesh', 'Pastel blobs', 'Blueprint grid']) {
        const formId = await createFormViaApi(page, 'event_registration');
        await applyPreset(page, formId, preset);
        await page.goto(await publishViaApi(page, formId));
        const heading = page.getByRole('heading', { level: 1 });
        await expect(heading).toBeVisible();
        await expectNoSeriousViolations(page, heading);
      }
    });
  });
}
