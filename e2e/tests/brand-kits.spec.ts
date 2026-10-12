import { expect, test, type Page } from '@playwright/test';
import { trackConsoleProblems } from './helpers.js';

// Saving a brand kit from a form's Design Studio, making it the default for new forms and
// applying it to another form. In a workspace of its own, so its default kit cannot reach the
// forms other tests create at the same time.

async function createWorkspace(page: Page): Promise<string> {
  const res = await page.request.post('/api/workspaces', {
    data: { name: `Kits ${Date.now().toString(36)}` },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

async function createForm(page: Page, workspaceId: string): Promise<{ id: string; theme: Theme }> {
  const res = await page.request.post(`/api/workspaces/${workspaceId}/forms`, {
    data: { templateId: 'feedback_survey' },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { id: string; theme: Theme };
}

interface Theme {
  colors: { primary: string; containerBackground: string };
  typography: { headingFont: string; bodyFont: string };
}

/** Waits until the editor has persisted the latest design change. */
async function expectSaved(page: Page) {
  await expect(page.getByText('Saved', { exact: true })).toBeAttached({ timeout: 10_000 });
}

test('saves a brand kit, starts new forms with it and applies it to others', async ({ page }) => {
  const problems = trackConsoleProblems(page);
  const workspaceId = await createWorkspace(page);
  try {
    const source = await createForm(page, workspaceId);
    const other = await createForm(page, workspaceId);
    await page.goto(`/app/forms/${source.id}/edit`);

    // Give the form a look of its own, then save it as the workspace's default kit.
    await page.getByRole('tab', { name: 'Design' }).click();
    await page
      .getByRole('radiogroup', { name: 'Theme' })
      .getByRole('radio', { name: /^Midnight/ })
      .click();
    await expectSaved(page);
    await page.getByRole('button', { name: 'Save as brand kit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Save as brand kit' });
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Night brand');
    await dialog.getByRole('checkbox', { name: 'Use for new forms' }).click();
    await dialog.getByRole('button', { name: 'Save kit' }).click();
    await expect(page.getByText('Saved Night brand')).toBeVisible();

    const kits = page.getByRole('list', { name: 'Brand kits' });
    await expect(kits.getByRole('button', { name: /Night brand/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(kits.getByText('Default')).toBeVisible();

    // New forms start with the kit.
    const midnight = (await (await page.request.get(`/api/forms/${source.id}`)).json()) as {
      theme: Theme;
    };
    const fresh = await createForm(page, workspaceId);
    expect(fresh.theme.colors).toEqual(midnight.theme.colors);

    // An existing form takes it in one click.
    await page.goto(`/app/forms/${other.id}/edit`);
    await page.getByRole('tab', { name: 'Design' }).click();
    const button = page.getByRole('list', { name: 'Brand kits' }).getByRole('button', {
      name: /Night brand/,
    });
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expectSaved(page);
    const applied = (await (await page.request.get(`/api/forms/${other.id}`)).json()) as {
      theme: Theme;
    };
    expect(applied.theme.colors.primary).toBe(midnight.theme.colors.primary);
    expect(problems).toEqual([]);
  } finally {
    await page.request.delete(`/api/workspaces/${workspaceId}`);
  }
});
