import { expect, test } from '@playwright/test';
import { E2E_PASSWORD, latestEmailTo, trackConsoleProblems, uniqueEmail } from './helpers.js';

// Inviting someone new: the email, signing up from the link, and joining as a viewer.

test('invites someone who signs up from the email and joins', async ({ page, browser }) => {
  const problems = trackConsoleProblems(page);
  const invitee = uniqueEmail('invitee');

  await page.goto('/app/settings/workspace');
  await page.getByRole('textbox', { name: 'Email' }).fill(invitee);
  await page.getByRole('combobox', { name: 'Role', exact: true }).click();
  await page.getByRole('option', { name: /^Viewer/ }).click();
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText(`Invite sent to ${invitee}`)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Open invites' })).toContainText(invitee);

  const email = await latestEmailTo(invitee);
  expect(email.subject).toMatch(/invited you to .+ on Formyx$/);
  const link = /https?:\/\/\S+\/invite\/[\w-]+/.exec(email.text)?.[0];
  if (!link) throw new Error('The email has no invite link');

  // The invitee, in a browser that has never signed in.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const guest = await context.newPage();
  const guestProblems = trackConsoleProblems(guest);
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByRole('heading', { level: 1, name: /^Join / })).toBeVisible();
  await expect(guest.getByText(/invited you as a viewer/)).toBeVisible();

  await guest.getByRole('link', { name: 'Sign up to accept' }).click();
  await expect(guest.getByLabel('Email')).toHaveValue(invitee);
  await guest.getByLabel('Name').fill('Invited Person');
  await guest.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await guest.getByRole('button', { name: 'Create account' }).click();

  // Back on the invite, now signed in with the invited address.
  await expect(guest).toHaveURL(/\/invite\//);
  await guest.getByRole('button', { name: /^Join / }).click();
  await expect(guest).toHaveURL(/\/app\/forms$/);
  await expect(guest.getByText(/^You joined /)).toBeVisible();

  // The new member reads but cannot build: no way to create forms.
  await expect(guest.getByRole('button', { name: /New form/ })).toHaveCount(0);
  await context.close();

  await page.reload();
  const members = page.getByRole('list', { name: 'Members' });
  await expect(members).toContainText(invitee);
  // Other runs and projects invite people with the same name: look at this invitee's row.
  const row = members.getByRole('listitem').filter({ hasText: invitee });
  await expect(row.getByRole('combobox', { name: 'Role of Invited Person' })).toHaveText('Viewer');
  expect(problems).toEqual([]);
  expect(guestProblems).toEqual([]);
});
