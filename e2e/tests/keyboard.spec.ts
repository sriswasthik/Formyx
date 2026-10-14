import { expect, test, type Locator, type Page } from '@playwright/test';
import { createFormViaApi, publishViaApi, trackConsoleProblems } from './helpers.js';

// Keyboard only: no clicks, no pointer. Every stop on the way shows where focus is.

/** Whether the focused element (or the control drawn around it) shows a focus indicator. */
async function focusIsVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const focused = document.activeElement;
    if (!focused || focused === document.body) return true;
    // Hidden inputs (radios, checkboxes) are drawn by an ancestor, which carries the ring.
    for (let node: Element | null = focused, depth = 0; node && depth < 4; depth += 1) {
      const style = getComputedStyle(node);
      const outline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
      if (outline || style.boxShadow !== 'none') return true;
      node = node.parentElement;
    }
    return false;
  });
}

/** Presses Tab (or Shift+Tab) until `target` has focus, checking each stop shows it. */
async function tabTo(page: Page, target: Locator, { back = false, max = 120 } = {}) {
  for (let presses = 0; presses < max; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    const description = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return 'nothing';
      const name = el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 40);
      return `${el.tagName.toLowerCase()} ${name}`;
    });
    expect(await focusIsVisible(page), `No visible focus on ${description}`).toBe(true);
  }
  throw new Error(`Focus never reached the target in ${String(max)} presses`);
}

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
  {
    id: 'fld_score',
    type: 'rating',
    label: 'How likely are you to stay?',
    required: true,
    ratingScale: 5,
    ratingStyle: 'stars',
  },
  { id: 'fld_notes', type: 'long_text', label: 'Anything else?', required: false },
];

test('answers a conversational form with the keyboard alone', async ({ page }) => {
  const problems = trackConsoleProblems(page);
  const formId = await createFormViaApi(page, 'blank');
  const form = (await (await page.request.get(`/api/forms/${formId}`)).json()) as {
    version: number;
    draftSchema: Record<string, unknown>;
    theme: { layout: Record<string, unknown> };
  };
  const saved = await page.request.patch(`/api/forms/${formId}`, {
    data: {
      version: form.version,
      title: 'Keyboard survey',
      draftSchema: { ...form.draftSchema, fields: FIELDS },
      theme: { ...form.theme, layout: { ...form.theme.layout, mode: 'conversational' } },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await page.goto(await publishViaApi(page, formId));
  await expect(page.getByRole('heading', { level: 1, name: 'Keyboard survey' })).toBeVisible();

  const name = page.getByRole('textbox', { name: /Your name/ });
  await tabTo(page, name);
  await page.keyboard.type('Ada');
  await page.keyboard.press('Enter');

  // Arrow keys choose; Alt + Down moves on from anywhere.
  await expect(page.getByRole('radio', { name: 'Free' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: 'Pro' })).toBeChecked();
  await page.keyboard.press('Alt+ArrowDown');

  // A rating: arrow keys move along the stars.
  const stars = page.getByRole('group', { name: /How likely are you to stay/ });
  await expect(stars).toBeVisible();
  await tabTo(page, stars.getByRole('radio').first());
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(stars.getByRole('radio', { checked: true })).toHaveCount(1);
  await page.keyboard.press('Alt+ArrowDown');

  // Back up with Alt + Up: the answer is still there.
  const notes = page.getByRole('textbox', { name: 'Anything else?' });
  await expect(notes).toBeFocused();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(stars.getByRole('radio', { checked: true })).toHaveCount(1);
  await page.keyboard.press('Alt+ArrowDown');
  await expect(notes).toBeFocused();
  await page.keyboard.type('All by keyboard.');

  // The last step: Tab to Submit and press it.
  await tabTo(page, page.getByRole('button', { name: 'Submit' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: /Thank/ })).toBeVisible();
  expect(problems).toEqual([]);
});

test('designs a form in the Design Studio with the keyboard alone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'The panel layout is the desktop editor');
  const problems = trackConsoleProblems(page);
  const formId = await createFormViaApi(page, 'feedback_survey');
  await page.goto(`/app/forms/${formId}/edit`);
  await expect(page.getByRole('textbox', { name: 'Form title' })).toBeVisible();

  // The panel is the last thing on the page: back into it from the end.
  const panelTabs = page.getByRole('tablist', { name: 'Panel' });
  await tabTo(page, panelTabs.getByRole('tab', { selected: true }), { back: true });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(panelTabs.getByRole('tab', { name: 'Design' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // A preset, chosen with the arrow keys.
  const presets = page.getByRole('radiogroup', { name: 'Theme' });
  const presetBefore = await presets.getByRole('radio', { checked: true }).getAttribute('value');
  await tabTo(page, presets.getByRole('radio', { checked: true }));
  const first = await page.evaluate(() => document.activeElement?.getAttribute('value'));
  await page.keyboard.press('ArrowRight');
  // Radix moves focus a moment after the key (in a timeout): choose once it has arrived.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('value')))
    .not.toBe(first);
  await page.keyboard.press('Space');
  const chosen = presets.getByRole('radio', { checked: true });
  await expect(chosen).toHaveCount(1);
  if (presetBefore) {
    await expect(chosen).not.toHaveAttribute('value', presetBefore);
  }

  // Typography: a heading font, searched for and picked. The sections stand in a column.
  const sections = page.getByRole('tab', { name: 'Typography' });
  await tabTo(page, page.getByRole('tab', { name: 'Presets' }), { back: true });
  for (let i = 0; i < 6 && !(await sections.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
  await expect(sections).toHaveAttribute('aria-selected', 'true');
  const headings = page.getByRole('button', { name: 'Headings', exact: true });
  await tabTo(page, headings);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Search headings fonts' })).toBeFocused();
  await page.keyboard.type('fraunces');
  await page.keyboard.press('Enter');
  await expect(headings).toContainText('Fraunces');
  await expect(headings).toBeFocused();

  // Background: a mesh gradient, added from the menu.
  const background = page.getByRole('tab', { name: 'Background' });
  await tabTo(page, page.getByRole('tab', { name: 'Typography' }), { back: true });
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('tab', { name: 'Colours' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(background).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(background).toHaveAttribute('aria-selected', 'true');
  const layers = page.getByRole('list', { name: 'Background layers, top first' });
  const before = await layers.getByRole('listitem').count();
  await tabTo(page, page.getByRole('button', { name: 'Add layer' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem').first()).toBeFocused();
  const mesh = page.getByRole('menuitem', { name: /Mesh gradient/ });
  for (let i = 0; i < 8 && !(await mesh.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(mesh).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(layers.getByRole('listitem')).toHaveCount(before + 1);

  await expect(page.getByText('Saved', { exact: true })).toBeAttached({ timeout: 10_000 });
  expect(problems).toEqual([]);
});
