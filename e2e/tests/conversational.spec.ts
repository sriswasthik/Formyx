import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createFormViaApi, publishViaApi, trackConsoleProblems } from './helpers.js';

// The conversational layout: one question at a time, by keyboard, pointer and on phones.

const FIELDS = [
  { id: 'fld_name', type: 'short_text', label: 'Your name', required: true },
  {
    id: 'fld_plan',
    type: 'single_choice',
    label: 'Pick a plan',
    required: true,
    options: [
      { id: 'opt_free', label: 'Free' },
      { id: 'opt_pro', label: 'Pro' },
    ],
  },
  { id: 'fld_notes', type: 'long_text', label: 'Anything else?', required: false },
];

/** A published conversational form with three questions and a steps progress bar. */
async function publishConversationalForm(page: Page): Promise<string> {
  const formId = await createFormViaApi(page, 'blank');
  const current = await page.request.get(`/api/forms/${formId}`);
  const form = (await current.json()) as {
    version: number;
    draftSchema: Record<string, unknown>;
    theme: { layout: Record<string, unknown>; motion: Record<string, unknown> };
  };
  const saved = await page.request.patch(`/api/forms/${formId}`, {
    data: {
      version: form.version,
      title: 'Plan survey',
      draftSchema: { ...form.draftSchema, fields: FIELDS },
      theme: {
        ...form.theme,
        layout: {
          ...form.theme.layout,
          mode: 'conversational',
          progress: { style: 'steps', position: 'top' },
        },
        motion: { ...form.theme.motion, pageTransition: 'slide' },
      },
    },
  });
  expect(saved.ok()).toBe(true);
  return publishViaApi(page, formId);
}

const progress = (page: Page) => page.getByRole('progressbar', { name: 'Progress' });

test('answers a conversational form one question at a time', async ({ page }) => {
  const problems = trackConsoleProblems(page);
  await page.goto(await publishConversationalForm(page));

  await expect(page.getByRole('heading', { level: 1, name: 'Plan survey' })).toBeVisible();
  await expect(progress(page)).toHaveAttribute('aria-valuetext', 'Question 1 of 3');
  await expect(page.getByRole('radio')).toHaveCount(0);

  // A required question holds the flow until it is answered; Enter continues.
  const name = page.getByRole('textbox', { name: /Your name/ });
  await name.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('This question is required')).toBeVisible();
  await name.fill('Ada');
  await page.keyboard.press('Enter');

  // Focus follows to the next question; arrow keys stay with the radios.
  const free = page.getByRole('radio', { name: 'Free' });
  await expect(free).toBeFocused();
  await expect(progress(page)).toHaveAttribute('aria-valuetext', 'Question 2 of 3');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: 'Pro' })).toBeChecked();
  await page.waitForTimeout(600);
  await expect(page.getByRole('group', { name: /Pick a plan/ })).toBeVisible();

  // A click on a single choice moves on by itself; Back returns with the answer kept.
  await page.getByText('Free', { exact: true }).click();
  const notes = page.getByRole('textbox', { name: 'Anything else?' });
  await expect(notes).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('radio', { name: 'Free' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Free' })).toBeFocused();

  // Alt + arrow moves from anywhere; in a text area Enter adds a line, Ctrl + Enter sends.
  await page.keyboard.press('Alt+ArrowDown');
  await expect(notes).toBeFocused();
  await notes.pressSequentially('Line one');
  await page.keyboard.press('Enter');
  await notes.pressSequentially('Line two');
  await expect(notes).toHaveValue('Line one\nLine two');
  await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
  await page.keyboard.press('Control+Enter');

  await expect(page.getByRole('status').filter({ hasText: /Thank/ })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(problems).toEqual([]);
});

test('keeps the buttons in reach and passes axe, with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(await publishConversationalForm(page));
  const next = page.getByRole('button', { name: 'Next' });
  await expect(next).toBeInViewport();

  await page.getByRole('textbox', { name: /Your name/ }).fill('Grace');
  await next.click();
  // Without motion the next question is there at once.
  await expect(page.getByRole('radio', { name: 'Free' })).toBeFocused({ timeout: 1000 });
  await expect(page.getByRole('button', { name: 'Back' })).toBeInViewport();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});
