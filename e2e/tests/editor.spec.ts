import { expect, test, type Locator, type Page } from '@playwright/test';
import { createFormViaApi, trackConsoleProblems } from './helpers.js';

// Drag and drop needs real layout, so it is covered here rather than in jsdom.
// Every test edits a form it created itself.

const SATISFIED = 'Overall, how satisfied are you with our product?';
const RECOMMEND = 'How likely are you to recommend us to a friend or colleague?';
const LIKE = 'What do you like most?';

/** The question at this 1-based position on the canvas. */
function question(page: Page, position: number): Locator {
  return page.getByRole('button', { name: new RegExp(`^Question ${String(position)}: `) });
}

/** Question labels in canvas order, from each question's "Question N: label, Type" name. */
async function questionOrder(page: Page): Promise<string[]> {
  const names = await page
    .getByRole('button', { name: /^Question \d+: / })
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label') ?? ''));
  return names.map((name) => name.replace(/^Question \d+: /, '').replace(/, [^,]+$/, ''));
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element is not visible');
  return box;
}

/** Drags with the mouse, dropping over the top or bottom part of the target. */
async function drag(page: Page, source: Locator, target: Locator, edge: 'top' | 'bottom') {
  const from = await boxOf(source);
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Past the few pixels a press may wobble before it counts as a drag.
  await page.mouse.move(startX + 12, startY + 12, { steps: 4 });

  const to = await boxOf(target);
  const y = edge === 'top' ? to.y + to.height * 0.2 : to.y + to.height * 0.8;
  await page.mouse.move(to.x + to.width / 2, y, { steps: 16 });
  await page.mouse.up();
}

/** Waits for the edit to be saved: "Unsaved changes" while the save waits, then "Saved". */
async function expectSaved(page: Page) {
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeAttached();
  await expect(page.getByText('Saved', { exact: true })).toBeAttached({ timeout: 10_000 });
}

async function openEditor(page: Page, templateId: 'blank' | 'feedback_survey') {
  const formId = await createFormViaApi(page, templateId);
  await page.goto(`/app/forms/${formId}/edit`);
  // The first load can be slow while the dev server compiles the editor for parallel tests.
  await expect(page.getByRole('textbox', { name: 'Form title' })).toBeVisible({ timeout: 15_000 });
}

test.describe('on large screens', () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Phones use the tabbed editor');
  });

  test('drops a question type between two questions and saves it', async ({ page }) => {
    const problems = trackConsoleProblems(page);
    await openEditor(page, 'feedback_survey');

    await drag(page, page.getByRole('button', { name: 'Add email' }), question(page, 2), 'top');

    await expect(question(page, 2)).toHaveAccessibleName('Question 2: Untitled question, Email');
    await expect(question(page, 2)).toHaveAttribute('aria-current', 'true');
    await expect
      .poll(() => questionOrder(page))
      .toEqual([
        SATISFIED,
        'Untitled question',
        RECOMMEND,
        LIKE,
        'What could we do better?',
        'Which features do you use most?',
        'May we follow up with you about your feedback?',
        'Your email',
      ]);

    // The new question is selected, so its settings are open.
    await page.getByRole('textbox', { name: 'Question', exact: true }).fill('Work email');
    await expect(question(page, 2)).toHaveAccessibleName('Question 2: Work email, Email');
    await expectSaved(page);

    await page.reload();
    await expect(question(page, 2)).toHaveAccessibleName('Question 2: Work email, Email');
    const questions = page.getByRole('list', { name: 'Questions' }).getByRole('listitem');
    await expect(questions).toHaveCount(8);
    expect(problems).toEqual([]);
  });

  test('reorders questions with the mouse and the keyboard, and undoes it', async ({ page }) => {
    const problems = trackConsoleProblems(page);
    await openEditor(page, 'feedback_survey');
    const firstThree = async () => (await questionOrder(page)).slice(0, 3);

    // Mouse: drag the first question onto the third.
    await drag(page, question(page, 1), question(page, 3), 'bottom');
    await expect.poll(firstThree).toEqual([RECOMMEND, LIKE, SATISFIED]);

    // Keyboard: pick up the first question with Space, move it down one, drop it.
    const handle = page.getByRole('button', { name: 'Move question 1' });
    await handle.press('Space');
    await handle.press('ArrowDown');
    await handle.press('Space');
    await expect.poll(firstThree).toEqual([LIKE, RECOMMEND, SATISFIED]);

    // Undo both moves, then redo one, with shortcuts and the top bar.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(firstThree).toEqual([RECOMMEND, LIKE, SATISFIED]);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(firstThree).toEqual([SATISFIED, RECOMMEND, LIKE]);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(firstThree).toEqual([RECOMMEND, LIKE, SATISFIED]);

    await expectSaved(page);
    await page.reload();
    await expect.poll(firstThree).toEqual([RECOMMEND, LIKE, SATISFIED]);
    expect(problems).toEqual([]);
  });

  test('previews the form with working inputs', async ({ page }) => {
    await openEditor(page, 'feedback_survey');

    await page.getByRole('radio', { name: 'Preview' }).click();
    await expect(page.getByText(/Answers are not saved/)).toBeVisible();
    await page.getByRole('textbox', { name: LIKE }).fill('The drag and drop');
    await page.getByRole('button', { name: 'Send feedback' }).click();
    // Required questions were skipped: they are flagged and the first one takes focus.
    const satisfaction = page.getByRole('group', { name: SATISFIED });
    await expect(satisfaction.getByRole('radio', { name: '1', exact: true })).toBeFocused();
    await expect(satisfaction.getByText('This question is required')).toBeVisible();

    await page.getByRole('radio', { name: 'Build' }).click();
    await expect(page.getByRole('navigation', { name: 'Question types' })).toBeVisible();
  });
});

test.describe('on phones', () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Large screens show everything side by side');
  });

  test('builds a form with the tabs and the bottom sheet', async ({ page }) => {
    const problems = trackConsoleProblems(page);
    await openEditor(page, 'blank');
    await expect(page.getByText('Tap Add question to get started.')).toBeVisible();

    await page.getByRole('button', { name: 'Add question' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add a question' });
    await sheet.getByRole('button', { name: 'Add email' }).click();
    await expect(sheet).toBeHidden();
    await expect(question(page, 1)).toHaveAccessibleName('Question 1: Untitled question, Email');

    // The new question is selected; its toolbar opens the Settings tab.
    await page.getByRole('button', { name: 'Question settings' }).click();
    await expect(page.getByRole('tab', { name: 'Settings', selected: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Question', exact: true }).fill('Work email');
    await expectSaved(page);

    await page.getByRole('tab', { name: 'Preview' }).click();
    await page.getByRole('textbox', { name: 'Work email' }).fill('ada@example.com');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);

    await page.reload();
    await expect(question(page, 1)).toHaveAccessibleName('Question 1: Work email, Email');
    expect(problems).toEqual([]);
  });
});
