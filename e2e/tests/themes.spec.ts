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
  await page.getByRole('tab', { name: 'Colours' }).click();
  await page
    .getByRole('radiogroup', { name: 'Accent colour' })
    .getByRole('radio', { name: 'Teal' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Plain background' })
    .getByRole('radio', { name: 'Dark' })
    .click();
  await page.getByRole('tab', { name: 'Components' }).click();
  await page.getByRole('slider', { name: 'Corner radius' }).focus();
  await page.keyboard.press('Home');
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

test('applies a preset and publishes it with its background', async ({ page }) => {
  const problems = trackConsoleProblems(page);
  const formId = await createFormViaApi(page, 'feedback_survey');
  await page.goto(`/app/forms/${formId}/edit`);

  await page.getByRole('tab', { name: 'Design' }).click();
  const presets = page.getByRole('radiogroup', { name: 'Theme' });
  // Everything is unlocked during the beta, so Pro presets publish like any other.
  await presets.getByRole('radio', { name: 'Sea glass Pro' }).click();
  await expect(presets.getByRole('radio', { name: 'Sea glass Pro' })).toBeChecked();
  await expectSaved(page);

  const publicPath = await publishViaApi(page, formId);
  await page.goto(publicPath);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[data-layer="mesh"]')).toHaveCount(1);
  await expect(page.locator('[data-form-container="floating"]')).toBeVisible();
  expect(await formVariable(page, '--form-heading-font')).toMatch(/^'DM Sans Variable'/);
  await expect(page.getByRole('link', { name: 'Made with Formyx' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(problems).toEqual([]);
});

test('builds a layered background in the Design Studio and publishes it', async ({ page }) => {
  const problems = trackConsoleProblems(page);
  const formId = await createFormViaApi(page, 'feedback_survey');
  await page.goto(`/app/forms/${formId}/edit`);

  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('tab', { name: 'Background' }).click();
  const layers = page.getByRole('list', { name: 'Background layers, top first' });

  // A mesh, regenerated from a palette and shuffled.
  await page.getByRole('button', { name: 'Add layer' }).click();
  await page.getByRole('menuitem', { name: /Mesh gradient/ }).click();
  await page.getByRole('button', { name: 'Generate from Ocean' }).click();
  await page.getByRole('button', { name: 'Shuffle' }).click();

  // A dot texture, denser.
  await page.getByRole('button', { name: 'Add layer' }).click();
  await page.getByRole('menuitem', { name: /Texture/ }).click();
  await page.getByRole('radio', { name: /^Dots/ }).click();
  await page.getByRole('slider', { name: 'Density' }).focus();
  await page.keyboard.press('ArrowRight');

  // Shapes, scattered and left out on phones.
  await page.getByRole('button', { name: 'Add layer' }).click();
  await page.getByRole('menuitem', { name: /Shapes/ }).click();
  await page.getByRole('button', { name: 'Scatter' }).click();
  await expect(page.getByRole('switch', { name: 'Hide on phones' })).toBeChecked();

  await expect(layers.getByRole('listitem')).toHaveCount(4);
  // Busy backgrounds need help to stay readable: one click puts the form in a card.
  const fix = page.getByRole('button', { name: 'Put the form in a card' });
  if (await fix.isVisible()) await fix.click();
  await expect(page.getByText('Some text may be hard to read')).toHaveCount(0);
  await expectSaved(page);

  const publicPath = await publishViaApi(page, formId);
  await page.goto(publicPath);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const drawn = page.locator('[data-theme-background] [data-layer]');
  await expect(drawn).toHaveCount(4);
  expect(
    await drawn.evaluateAll((elements) => elements.map((element) => element.dataset.layer)),
  ).toEqual(['solid', 'mesh', 'texture', 'shapes']);
  const shapesShown = await page
    .locator('[data-layer="shapes"]')
    .evaluate((element) => getComputedStyle(element).display !== 'none');
  // Shapes stay off narrow screens, and show on wide ones.
  expect(shapesShown).toBe((page.viewportSize()?.width ?? 0) >= 576);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(problems).toEqual([]);
});

/** Whether the page has downloaded a font of `family` (its CSS family name, unquoted). */
async function fontLoaded(page: Page, family: string): Promise<boolean> {
  return page.evaluate(async (name) => {
    await document.fonts.ready;
    return [...document.fonts].some(
      (face) => face.family.replace(/["']/g, '') === name && face.status === 'loaded',
    );
  }, family);
}

test('picks Pro fonts in Typography, and the published form loads them', async ({ page }) => {
  const problems = trackConsoleProblems(page);
  const formId = await createFormViaApi(page, 'feedback_survey');
  await page.goto(`/app/forms/${formId}/edit`);

  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('tab', { name: 'Typography' }).click();
  await page.getByRole('button', { name: 'Headings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search headings fonts' }).fill('fraunces');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search text fonts' }).fill('space grotesk');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Headings', exact: true })).toContainText(
    'Fraunces',
  );
  await expectSaved(page);

  const publicPath = await publishViaApi(page, formId);
  await page.goto(publicPath);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const heading = await formVariable(page, '--form-heading-font');
  const body = await formVariable(page, '--form-body-font');
  expect(heading).toMatch(/^'?Fraunces/);
  expect(body).toMatch(/^'?Space Grotesk/);
  // Both are downloaded for respondents, not just named.
  await expect
    .poll(() => fontLoaded(page, heading.split(',')[0]?.replace(/'/g, '') ?? ''))
    .toBe(true);
  await expect.poll(() => fontLoaded(page, body.split(',')[0]?.replace(/'/g, '') ?? '')).toBe(true);
  expect(problems).toEqual([]);
});
