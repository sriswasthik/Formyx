import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  createFormViaApi,
  E2E_PASSWORD,
  latestEmailTo,
  publishViaApi,
  trackConsoleProblems,
  uniqueEmail,
} from './helpers.js';

// Who may answer and when (opening and closing times, a closed message, an email first), and
// who may change a form: viewers read it, but every way to change it is closed to them.

const FIELDS = [{ id: 'fld_name', type: 'short_text', label: 'Your name', required: true }];
const ACCESS = { oneResponsePer: 'off', requireEmail: false, allowEdits: false, unlisted: true };

async function publishForm(
  page: Page,
  title: string,
  access: Record<string, unknown> = {},
): Promise<{ formId: string; path: string; slug: string }> {
  const formId = await createFormViaApi(page, 'blank');
  const form = (await (await page.request.get(`/api/forms/${formId}`)).json()) as {
    version: number;
    draftSchema: Record<string, unknown>;
  };
  const saved = await page.request.patch(`/api/forms/${formId}`, {
    data: { version: form.version, title, draftSchema: { ...form.draftSchema, fields: FIELDS } },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await setAccess(page, formId, access);
  const path = await publishViaApi(page, formId);
  return { formId, path, slug: path.replace('/f/', '') };
}

async function setAccess(page: Page, formId: string, access: Record<string, unknown>) {
  const res = await page.request.patch(`/api/forms/${formId}/settings`, {
    data: { access: { ...ACCESS, ...access } },
  });
  expect(res.ok(), await res.text()).toBe(true);
}

async function stranger(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return context.newPage();
}

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

test('opens on schedule, then closes with its own message', async ({ page, browser }) => {
  const { formId, path, slug } = await publishForm(page, 'Summer camp', { opensAt: inDays(2) });
  const visitor = await stranger(browser);
  const problems = trackConsoleProblems(visitor);

  await visitor.goto(path);
  await expect(visitor.getByRole('heading', { name: 'This form is not open yet' })).toBeVisible();
  await expect(visitor.getByText(/^It opens on /)).toBeVisible();
  await expect(visitor.getByRole('textbox', { name: /Your name/ })).toHaveCount(0);

  await setAccess(page, formId, {
    closesAt: inDays(-1),
    closedMessage: 'Sign-ups have ended. See you next summer!',
  });
  await visitor.reload();
  await expect(visitor.getByRole('heading', { name: 'This form is closed' })).toBeVisible();
  await expect(visitor.getByText('Sign-ups have ended. See you next summer!')).toBeVisible();

  // The API refuses responses too, not just the page.
  const sent = await visitor.request.post(`/api/public/forms/${slug}/submissions`, {
    data: { answers: { fld_name: 'Ada' } },
  });
  expect(sent.ok()).toBe(false);
  expect(problems.filter((problem) => !/\b(403|409|410)\b/.test(problem))).toEqual([]);
});

test('asks for an email address before the questions, and keeps it with the response', async ({
  page,
  browser,
}) => {
  const { formId, path } = await publishForm(page, 'Workshop waitlist', { requireEmail: true });
  const email = uniqueEmail('waitlist');
  const visitor = await stranger(browser);
  const problems = trackConsoleProblems(visitor);

  await visitor.goto(path);
  await expect(
    visitor.getByText('This form asks for your email address before you start.'),
  ).toBeVisible();
  await visitor.getByLabel('Email address').fill('not-an-email');
  await visitor.getByRole('button', { name: 'Continue' }).click();
  await expect(visitor.getByRole('textbox', { name: /Your name/ })).toHaveCount(0);

  await visitor.getByLabel('Email address').fill(email);
  await visitor.getByRole('button', { name: 'Continue' }).click();
  await visitor.getByRole('textbox', { name: /Your name/ }).fill('Grace');
  await visitor.getByRole('button', { name: 'Submit' }).click();
  await expect(visitor.getByText('Thanks! Your response has been recorded.')).toBeVisible();

  const responses = await page.request.get(`/api/forms/${formId}/submissions`);
  expect(JSON.stringify(await responses.json())).toContain(email);
  expect(problems).toEqual([]);
});

test('lets viewers read a form, and closes every way to change it', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const { formId } = await publishForm(page, 'Board minutes');
  const me = (await (await page.request.get('/api/auth/me')).json()) as {
    workspaces: { id: string }[];
  };
  const workspaceId = me.workspaces[0]?.id ?? '';

  // A viewer joins through an invite.
  const viewerEmail = uniqueEmail('viewer');
  const invited = await page.request.post(`/api/workspaces/${workspaceId}/invites`, {
    data: { email: viewerEmail, role: 'VIEWER' },
  });
  expect(invited.ok(), await invited.text()).toBe(true);
  const token = /\/invite\/([\w-]+)/.exec((await latestEmailTo(viewerEmail)).text)?.[1] ?? '';
  const viewer = await stranger(browser);
  const problems = trackConsoleProblems(viewer);
  const registered = await viewer.request.post('/api/auth/register', {
    data: { name: 'Vera Viewer', email: viewerEmail, password: E2E_PASSWORD },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  expect((await viewer.request.post(`/api/invites/${token}/accept`)).ok()).toBe(true);
  await viewer.goto('/');
  await viewer.evaluate(() => {
    localStorage.setItem('formyx-signed-in', '1');
  });

  // The editor sends viewers to the read-only page, with nothing on it to change the form.
  await viewer.goto(`/app/forms/${formId}/edit`);
  await expect(viewer).toHaveURL(new RegExp(`/app/forms/${formId}$`));
  await expect(viewer.getByRole('heading', { level: 1, name: 'Board minutes' })).toBeVisible();
  const main = viewer.getByRole('main');
  await expect(
    main.getByText('You can view this form. Editors of the workspace can change it.'),
  ).toBeVisible();
  await expect(main.getByRole('link', { name: 'View responses' })).toBeVisible();
  await expect(main.getByRole('link', { name: /^(Edit|Integrations|Settings)$/ })).toHaveCount(0);
  await expect(main.getByRole('button', { name: /Publish|Delete|Rename/ })).toHaveCount(0);
  await viewer.goto(`/app/forms/${formId}/integrations`);
  await expect(viewer.getByText('Integrations are for editors')).toBeVisible();

  // And the API agrees.
  const form = (await (await viewer.request.get(`/api/forms/${formId}`)).json()) as {
    version: number;
  };
  const edits = await Promise.all([
    viewer.request.patch(`/api/forms/${formId}`, {
      data: { version: form.version, title: 'Renamed' },
    }),
    viewer.request.post(`/api/forms/${formId}/publish`, { data: { version: form.version } }),
    viewer.request.patch(`/api/forms/${formId}/settings`, { data: { access: ACCESS } }),
    viewer.request.delete(`/api/forms/${formId}`),
  ]);
  expect(edits.map((res) => res.status())).toEqual([403, 403, 403, 403]);
  expect(problems.filter((problem) => !problem.includes('403'))).toEqual([]);
});
