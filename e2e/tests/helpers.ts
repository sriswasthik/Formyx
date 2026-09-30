import { join } from 'node:path';
import type { Locator, Page, TestInfo } from '@playwright/test';

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
