import { expect, test, type Page } from '@playwright/test';
import { createFormViaApi, publishViaApi, trackConsoleProblems } from './helpers.js';

// Publishing in the editor, then answering through the public link as a respondent would.

const DIET_DETAILS = /Tell us about your dietary needs/;

/** Fills in the event registration's required questions. */
async function fillRegistration(page: Page) {
  await page.getByRole('textbox', { name: /Full name/ }).fill('Ada Lovelace');
  await page.getByRole('textbox', { name: /^Email/ }).fill('ada@example.com');
  // People click the option's row; the checkbox itself is drawn by the form.
  await page.locator('label', { hasText: 'Opening keynote' }).click();
  await expect(page.getByRole('checkbox', { name: 'Opening keynote' })).toBeChecked();
}

async function responseCount(page: Page, formId: string): Promise<number> {
  const res = await page.request.get(`/api/forms/${formId}`);
  return ((await res.json()) as { responseCount: number }).responseCount;
}

test.describe('on large screens', () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Covered at phone size below');
  });

  test('publishes a form, shares its link and collects a response', async ({ page, context }) => {
    const problems = trackConsoleProblems(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const formId = await createFormViaApi(page, 'event_registration');
    await page.goto(`/app/forms/${formId}/edit`);

    await page.getByRole('button', { name: 'Publish' }).click();

    const share = page.getByRole('dialog', { name: 'Your form is live' });
    await expect(share.getByRole('img', { name: /QR code/ })).toBeVisible();
    await expect(share.getByRole('link', { name: 'Download PNG' })).toHaveAttribute(
      'href',
      /^data:image\/png;base64,/,
    );
    const link = await share.getByRole('textbox', { name: 'Public link' }).inputValue();
    expect(link).toMatch(/\/f\/event-registration-[a-z0-9]+$/);
    await share.getByRole('button', { name: 'Copy link' }).click();
    await expect(share.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await share.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();

    // A respondent opens the link in another tab.
    const respondent = await context.newPage();
    const respondentProblems = trackConsoleProblems(respondent);
    await respondent.goto(link);
    await expect(
      respondent.getByRole('heading', { level: 1, name: 'Event registration' }),
    ).toBeVisible();

    // The follow-up appears only for "Other", and goes away again.
    const details = respondent.getByRole('textbox', { name: DIET_DETAILS });
    await expect(details).toHaveCount(0);
    await respondent.getByLabel('Dietary requirements').selectOption('Other');
    await expect(details).toBeVisible();
    await respondent.getByLabel('Dietary requirements').selectOption('Vegan');
    await expect(details).toHaveCount(0);

    // Submitting too early points at the first unanswered required question.
    await respondent.getByRole('button', { name: 'Register' }).click();
    await expect(respondent.getByRole('textbox', { name: /Full name/ })).toBeFocused();

    await fillRegistration(respondent);
    await respondent.getByRole('button', { name: 'Register' }).click();
    await expect(respondent.getByText(/You're registered!/)).toBeVisible();

    expect(await responseCount(page, formId)).toBe(1);
    expect(problems).toEqual([]);
    expect(respondentProblems).toEqual([]);
  });

  test('marks edits to a live form until they are published', async ({ page }) => {
    const formId = await createFormViaApi(page, 'event_registration');
    const publicPath = await publishViaApi(page, formId);
    await page.goto(`/app/forms/${formId}/edit`);

    await page.getByRole('textbox', { name: 'Form title' }).fill('Launch party');
    await expect(page.getByText('Unpublished changes')).toBeVisible();
    await page.getByRole('button', { name: 'Publish changes' }).click();
    await expect(page.getByText('Changes published')).toBeVisible();
    await expect(page.getByText('Unpublished changes')).toHaveCount(0);

    await page.goto(publicPath);
    await expect(page.getByRole('heading', { level: 1, name: 'Launch party' })).toBeVisible();
  });

  test('closes the form once its response limit is reached', async ({ page, context }) => {
    const formId = await createFormViaApi(page, 'event_registration');
    // The limit is a live setting: it applies at once, published or not.
    await page.goto(`/app/forms/${formId}/settings?section=access`);
    await page.getByRole('textbox', { name: 'Response limit' }).fill('1');
    await expect(page.getByRole('status').getByText('Saved')).toBeVisible();

    await page.goto(`/app/forms/${formId}/edit`);
    await page.getByRole('button', { name: 'Publish' }).click();
    const link = await page
      .getByRole('dialog', { name: 'Your form is live' })
      .getByRole('textbox', { name: 'Public link' })
      .inputValue();

    const respondent = await context.newPage();
    const respondentProblems = trackConsoleProblems(respondent);
    await respondent.goto(link);
    await fillRegistration(respondent);
    await respondent.getByRole('button', { name: 'Register' }).click();
    await expect(respondent.getByText(/You're registered!/)).toBeVisible();

    await respondent.reload();
    await expect(respondent.getByRole('heading', { name: 'This form is closed' })).toBeVisible();
    await expect(respondent.getByText('Event registration')).toBeVisible();
    // Closed is an expected state, so nothing shows up as a failed request.
    expect(respondentProblems).toEqual([]);

    // Reopening is refused while the limit still holds.
    await page.reload();
    // Nothing left to publish, so the button names the form's state and holds its options.
    const options = page.getByRole('button', { name: 'Closed: publishing options' });
    await expect(options).toBeVisible();
    await options.click();
    await page.getByRole('menuitem', { name: 'Reopen form' }).click();
    await expect(page.getByText(/reached its response limit/)).toBeVisible();
  });

  test('explains links to forms that do not exist', async ({ page }) => {
    await page.goto('/f/no-such-form-here');
    await expect(
      page.getByRole('heading', { level: 1, name: "This form doesn't exist" }),
    ).toBeVisible();
  });
});

test.describe('on phones', () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Covered at desktop size above');
  });

  test('publishes from the editor and fills in the form on a small screen', async ({ page }) => {
    const problems = trackConsoleProblems(page);
    const formId = await createFormViaApi(page, 'event_registration');
    await page.goto(`/app/forms/${formId}/edit`);

    await page.getByRole('button', { name: 'Publish' }).click();
    const share = page.getByRole('dialog', { name: 'Your form is live' });
    await expect(share.getByRole('img', { name: /QR code/ })).toBeVisible();
    const link = await share.getByRole('textbox', { name: 'Public link' }).inputValue();

    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'Event registration' })).toBeVisible();
    await page.getByLabel('Dietary requirements').selectOption('Other');
    await expect(page.getByRole('textbox', { name: DIET_DETAILS })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);

    await fillRegistration(page);
    await page.getByRole('textbox', { name: DIET_DETAILS }).fill('No nuts, please.');
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page.getByText(/You're registered!/)).toBeVisible();

    expect(await responseCount(page, formId)).toBe(1);
    expect(problems).toEqual([]);
  });
});
