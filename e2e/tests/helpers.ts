import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/** Browser state (cookies and localStorage) of the user signed up by `auth.setup.ts`. */
export const AUTH_STATE_PATH = join(import.meta.dirname, '..', 'playwright', '.auth', 'user.json');
/** Email and password of that user, for tests that log in through the form. */
export const AUTH_CREDENTIALS_PATH = join(
  import.meta.dirname,
  '..',
  'playwright',
  '.auth',
  'credentials.json',
);

export const E2E_PASSWORD = 'e2e-password-1234';

/**
 * Where the API saves the emails it sends during tests (`EMAIL_OUTBOX_DIR`). An API that was
 * already running when the tests started keeps its own settings, so start it fresh.
 */
export const OUTBOX_DIR = join(import.meta.dirname, '..', 'playwright', '.outbox');

interface OutboxFile {
  messages: { to: string; subject: string; text: string }[];
}

/** The newest email sent to `to`, waiting for it to arrive. */
export async function latestEmailTo(to: string): Promise<{ subject: string; text: string }> {
  let found: { subject: string; text: string } | undefined;
  await expect
    .poll(
      async () => {
        const names = await readdir(OUTBOX_DIR).catch(() => []);
        for (const name of names.sort().reverse()) {
          const file = JSON.parse(await readFile(join(OUTBOX_DIR, name), 'utf8')) as OutboxFile;
          found = file.messages.find((message) => message.to === to);
          if (found) return true;
        }
        return false;
      },
      { message: `An email to ${to}`, timeout: 10_000 },
    )
    .toBe(true);
  if (!found) throw new Error(`No email to ${to}`);
  return found;
}

/**
 * A new account's dashboard opens on the welcome (what Formyx is for, then templates): skips
 * it, as someone who wants to look around first would.
 */
export async function skipWelcome(page: Page): Promise<void> {
  const welcome = page.getByRole('dialog', { name: /Welcome to Formyx/ });
  await welcome.getByRole('button', { name: 'Skip for now' }).click();
  await expect(welcome).toBeHidden();
}

/** A fresh address per call, so runs never collide with accounts from earlier runs. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Collects console errors, warnings and uncaught exceptions for the page's lifetime. */
export function trackConsoleProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    problems.push(`pageerror: ${error.message}`);
  });
  return problems;
}

/** The sidebar, opening the navigation sheet first on mobile. */
export async function openSidebar(page: Page, testInfo: TestInfo): Promise<Locator> {
  if (testInfo.project.name !== 'mobile') return page.locator('aside');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  return page.getByRole('dialog', { name: 'Navigation' });
}

export async function fillLogIn(page: Page, email: string, password = E2E_PASSWORD) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** The form id in an `/app/forms/:id` or `/app/forms/:id/edit` path or URL. */
export function formIdFrom(path: string | null): string {
  return /\/app\/forms\/([^/?#]+)/.exec(path ?? '')?.[1] ?? '';
}

/** Creates a form from a template through the API, in the user's first workspace. */
export async function createFormViaApi(
  page: Page,
  templateId: 'blank' | 'event_registration' | 'feedback_survey',
): Promise<string> {
  const me = await page.request.get('/api/auth/me');
  expect(me.ok()).toBe(true);
  const { workspaces } = (await me.json()) as { workspaces: { id: string }[] };
  const workspaceId = workspaces[0]?.id ?? '';

  const created = await page.request.post(`/api/workspaces/${workspaceId}/forms`, {
    data: { templateId },
  });
  expect(created.ok()).toBe(true);
  const { id } = (await created.json()) as { id: string };
  return id;
}

/** Publishes the form's current draft through the API and returns its public path. */
export async function publishViaApi(page: Page, formId: string): Promise<string> {
  const form = await page.request.get(`/api/forms/${formId}`);
  expect(form.ok()).toBe(true);
  const { version, slug } = (await form.json()) as { version: number; slug: string };

  const published = await page.request.post(`/api/forms/${formId}/publish`, {
    data: { version },
  });
  expect(published.ok()).toBe(true);
  return `/f/${slug}`;
}

/** Picks a theme preset in the Design Studio (`name` as the preset list shows it). */
export async function applyPreset(page: Page, formId: string, name: string) {
  await page.goto(`/app/forms/${formId}/edit`);
  await page.getByRole('tab', { name: 'Design' }).click();
  const preset = page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', {
    name: new RegExp(`^${name}( Pro)?$`),
  });
  await preset.click();
  await expect(preset).toBeChecked();
  await expect(page.getByText('Saved', { exact: true })).toBeAttached({ timeout: 10_000 });
}
