import { expect, test, type Page } from '@playwright/test';
import { createFormViaApi, publishViaApi, trackConsoleProblems } from './helpers.js';

// Designing a form and seeing the design on the published form.

/** Waits for the edit to be saved: "Unsaved changes" while the save waits, then "Saved". */
async function expectSaved(page: Page) {
  await expect(page.getByText('Saved', { exact: true })).toBeAttached({ timeout: 10_000 });
}

/** A `--form-*` variable as the themed form sets it. */
async function formVariable(page: Page, name: string): Promise<string> {
  return page
    .locator(`[style*="${name}"]`)
    .first()
    .evaluate(
      (element, variable) => getComputedStyle(element).getPropertyValue(variable).trim(),
      name,
    );
}

test('designs a form in the editor and publishes the design with it', async ({ page }) => {
  const problems = trackConsoleProblems(page);
  const formId = await createFormViaApi(page, 'feedback_survey');
  await page.goto(`/app/forms/${formId}/edit`);

  await page.getByRole('tab', { name: 'Design' }).click();
  await page
    .getByRole('radiogroup', { name: 'Accent colour' })
    .getByRole('radio', { name: 'Teal' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Background' })
    .getByRole('radio', { name: 'Dark' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Corners' })
    .getByRole('radio', { name: 'Sharp' })
    .click();
  await expectSaved(page);

  // Publishing takes the design to respondents.
  const publicPath = await publishViaApi(page, formId);
  await page.goto(publicPath);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect((await formVariable(page, '--form-accent')).toUpperCase()).toBe('#337B7E');
  expect((await formVariable(page, '--form-bg')).toUpperCase()).toBe('#18181B');
  expect(await formVariable(page, '--form-radius')).toBe('0px');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(problems).toEqual([]);
});
