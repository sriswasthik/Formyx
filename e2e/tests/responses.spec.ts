import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createFormViaApi, publishViaApi, trackConsoleProblems } from './helpers.js';

// Watching responses arrive live, reading them, exporting them and deleting them.

/** Answers the feedback survey as a respondent would. */
async function answerFeedbackSurvey(page: Page, liked: string) {
  await page
    .getByRole('group', { name: /Overall, how satisfied/ })
    .locator('label', { hasText: /^5$/ })
    .click();
  await page
    .getByRole('group', { name: /How likely are you to recommend/ })
    .locator('label', { hasText: /^9$/ })
    .click();
  await page.getByRole('textbox', { name: 'What do you like most?' }).fill(liked);
  await page
    .getByRole('group', { name: /May we follow up/ })
    .locator('label', { hasText: 'No' })
    .click();
  await page.getByRole('button', { name: 'Send feedback' }).click();
  await expect(page.getByText(/Thank you!/)).toBeVisible();
}

test('shows responses as they arrive, exports them and deletes them', async ({
  page,
  context,
}, testInfo) => {
  const problems = trackConsoleProblems(page);
  const formId = await createFormViaApi(page, 'feedback_survey');
  const publicPath = await publishViaApi(page, formId);

  await page.goto(`/app/forms/${formId}/responses?tab=responses`);
  await expect(page.getByText('No responses yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Live/ }).first()).toBeVisible();

  // A respondent answers in another tab; the open page shows it without reloading.
  const respondent = await context.newPage();
  await respondent.goto(publicPath);
  await answerFeedbackSurvey(respondent, 'Clear charts, "quoted", with commas');
  await respondent.close();

  const row = page.getByRole('row').filter({ hasText: 'Clear charts' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('5 / 5');
  await expect(page.getByRole('tab', { name: /Responses/ })).toContainText('1');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  // The summary counted it too.
  await page.getByRole('tab', { name: 'Summary' }).click();
  const totals = page.getByRole('region', { name: 'Totals' });
  await expect(totals.getByText('Responses', { exact: true }).locator('..')).toContainText('1');
  await expect(page.getByText('9 of 10')).toBeVisible();

  if (testInfo.project.name !== 'mobile') {
    // The CSV has the question labels as headers and the answer properly quoted.
    await page.getByRole('tab', { name: /Responses/ }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^feedback-survey-responses-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await readFile(await file.path(), 'utf8');
    expect(csv).toContain('Overall, how satisfied are you with our product?');
    expect(csv).toContain('"Clear charts, ""quoted"", with commas"');
  } else {
    await page.getByRole('tab', { name: /Responses/ }).click();
  }

  // Open it in full, then delete it.
  await page.getByRole('button', { name: /^Open the response/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Response' });
  await expect(sheet.getByText('Clear charts, "quoted", with commas')).toBeVisible();
  await sheet.getByRole('button', { name: 'Delete response' }).click();
  await page
    .getByRole('alertdialog', { name: 'Delete this response?' })
    .getByRole('button', { name: 'Delete response' })
    .click();

  await expect(page.getByText('Response deleted')).toBeVisible();
  await expect(page.getByText('No responses yet', { exact: true })).toBeVisible();
  expect(problems).toEqual([]);
});
