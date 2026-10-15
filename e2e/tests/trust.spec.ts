import { expect, test } from '@playwright/test';
import { createFormViaApi, publishViaApi, trackConsoleProblems } from './helpers.js';

// Trust and safety, end to end: a form that phishes is held for review, and anyone can
// report a form from under it.

test('holds a form asking for bank details for review, and keeps it from respondents', async ({
  page,
}) => {
  const problems = trackConsoleProblems(page);
  const formId = await createFormViaApi(page, 'feedback_survey');
  const form = (await (await page.request.get(`/api/forms/${formId}`)).json()) as {
    version: number;
    slug: string;
    draftSchema: { fields: { label: string }[] };
  };
  const [first, ...rest] = form.draftSchema.fields;
  const draftSchema = {
    ...form.draftSchema,
    fields: [{ ...first, label: 'Your net banking password' }, ...rest],
  };
  const patched = await page.request.patch(`/api/forms/${formId}`, {
    data: { version: form.version, draftSchema },
  });
  expect(patched.ok()).toBe(true);

  await page.goto(`/app/forms/${formId}/edit`);
  await page.getByRole('button', { name: 'Publish' }).click();
  const dialog = page.getByRole('dialog', { name: 'We’re taking a quick look first' });
  await expect(dialog).toContainText('asks for a password and mentions net banking');
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByText('In review')).toBeVisible();

  await page.goto(`/f/${form.slug}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'This form is unavailable' }),
  ).toBeVisible();
  await expect(page.getByText('Your net banking password')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('reports a form from under it, in a new tab', async ({ page, context }) => {
  const problems = trackConsoleProblems(page);
  const publicPath = await publishViaApi(page, await createFormViaApi(page, 'feedback_survey'));
  await page.goto(publicPath);

  const [report] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: /Report this form/ }).click(),
  ]);
  await report.waitForLoadState();
  await expect(report.getByRole('heading', { name: 'What’s wrong with it?' })).toBeVisible();
  await report.getByLabel('It is spam or a scam').check();
  await report.getByRole('textbox', { name: /Anything else/ }).fill('Looks like a scam');
  await report.getByRole('button', { name: 'Send report' }).click();
  await expect(report.getByRole('heading', { name: 'Thanks for telling us' })).toBeVisible();
  expect(problems).toEqual([]);
});
