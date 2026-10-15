import { expect, test, type Page } from '@playwright/test';
import { formIdFrom, openTemplates, trackConsoleProblems } from './helpers.js';

// Runs signed in as the shared test user. Desktop and mobile run in parallel against the same
// workspace, so every test works with forms it created itself, found by id or unique title.

/** The dashboard card or row of the form with this id. */
function formItem(page: Page, formId: string) {
  return page
    .getByRole('list', { name: 'Forms' })
    .getByRole('listitem')
    .filter({ has: page.locator(`a[href="/app/forms/${formId}/edit"]`) });
}

async function createFromTemplate(page: Page, template: RegExp): Promise<string> {
  await page.goto('/app/forms');
  const dialog = await openTemplates(page);
  await dialog.getByRole('radio', { name: template }).check();
  await dialog.getByRole('button', { name: 'Create form' }).click();

  // A new form opens in the editor.
  await expect(page).toHaveURL(/\/app\/forms\/[a-z0-9]+\/edit$/);
  return formIdFrom(page.url());
}

async function deleteForm(page: Page, formId: string) {
  await formItem(page, formId)
    .getByRole('button', { name: /^Actions for/ })
    .click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete form' }).click();
  await expect(formItem(page, formId)).toHaveCount(0);
}

test('creates a form from a template, then renames, duplicates and deletes it', async ({
  page,
}, testInfo) => {
  const problems = trackConsoleProblems(page);
  const title = `Survey ${testInfo.project.name} ${Date.now().toString(36)}`;

  const formId = await createFromTemplate(page, /Feedback survey/);
  await expect(page.getByRole('textbox', { name: 'Form title' })).toHaveValue('Feedback survey');
  await expect(page.getByRole('list', { name: 'Questions' }).getByRole('listitem')).toHaveCount(7);

  await page.getByRole('link', { name: 'Back to all forms' }).click();
  const item = formItem(page, formId);
  await expect(item).toContainText('Draft');
  await expect(item).toContainText('No responses');
  await expect(item).toContainText('Edited just now');

  // Rename
  await item.getByRole('button', { name: 'Actions for Feedback survey' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename form' });
  await rename.getByLabel('Title').fill(title);
  await rename.getByRole('button', { name: 'Save' }).click();
  await expect(item.getByRole('link', { name: title })).toBeVisible();

  // Duplicate, then find both through search
  await item.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  // The sidebar's Recent links to it too: look in the list.
  const copy = page
    .getByRole('list', { name: 'Forms' })
    .getByRole('link', { name: `${title} (copy)` });
  await expect(copy).toBeVisible();
  const copyId = formIdFrom(await copy.getAttribute('href'));

  await page.getByRole('searchbox', { name: 'Search forms' }).fill(title);
  await expect(page).toHaveURL(/\?q=/);
  await expect(page.getByRole('list', { name: 'Forms' }).getByRole('listitem')).toHaveCount(2);

  // The rename survived a reload, and so does the search.
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search forms' })).toHaveValue(title);
  await expect(formItem(page, formId).getByRole('link', { name: title })).toBeVisible();

  await deleteForm(page, copyId);
  await deleteForm(page, formId);
  await expect(page.getByText('No forms match')).toBeVisible();
  expect(problems).toEqual([]);
});

test('the list view fits small screens', async ({ page }, testInfo) => {
  const formId = await createFromTemplate(page, /Event registration/);
  await page.goto('/app/forms');

  await page.getByRole('radio', { name: 'List view' }).click();
  await expect(formItem(page, formId)).toBeVisible();
  if (testInfo.project.name === 'desktop') {
    // The column headings (the sort menu says "Last edited" too).
    await expect(page.getByText('Last edited', { exact: true }).last()).toBeVisible();
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  await deleteForm(page, formId);
});
