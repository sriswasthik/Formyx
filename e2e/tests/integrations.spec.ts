import { expect, test, type Page } from '@playwright/test';
import { createFormViaApi, publishViaApi, trackConsoleProblems } from './helpers.js';

// Sprint 17's Integrations page with Google Sheets, against the fake Google in
// scripts/fake-google.mjs: connecting through Google's (fake) consent screen, responses
// reaching the sheet, and a revoked account showing as needing a reconnect, with the failed
// job listed, until it is connected again.

const fake = `http://localhost:${process.env.E2E_FAKE_PORT ?? '4590'}/google`;

// The fake Google has one account for everyone, and one test revokes it.
test.describe.configure({ mode: 'serial' });
test.beforeEach(({ page: _ }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'One fake Google account: desktop only');
});

interface FakeSheet {
  title: string;
  rows: (string | number | null)[][];
}

async function sheetTitled(page: Page, title: string): Promise<FakeSheet | undefined> {
  const response = await page.request.get(`${fake}/__sheets`);
  const all = (await response.json()) as FakeSheet[];
  return all.find((sheet) => sheet.title === title);
}

/** A published form with one text question, titled `title`. */
async function publishedForm(page: Page, title: string) {
  const formId = await createFormViaApi(page, 'blank');
  const current = await page.request.get(`/api/forms/${formId}`);
  const form = (await current.json()) as { version: number; draftSchema: object };
  const saved = await page.request.patch(`/api/forms/${formId}`, {
    data: {
      version: form.version,
      title,
      draftSchema: {
        ...form.draftSchema,
        fields: [{ id: 'fld_name', type: 'short_text', label: 'Your name', required: true }],
      },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return { formId, path: await publishViaApi(page, formId) };
}

async function respond(page: Page, path: string, name: string) {
  const slug = path.replace('/f/', '');
  const sent = await page.request.post(`/api/public/forms/${slug}/submissions`, {
    data: { answers: { fld_name: name } },
  });
  expect(sent.ok(), await sent.text()).toBe(true);
}

async function connectSheets(page: Page, formId: string) {
  await page.goto(`/app/forms/${formId}/integrations`);
  const card = page.getByRole('article', { name: /Google Sheets/ });
  await card.getByRole('button', { name: /Connect Google Sheets|Reconnect/ }).click();
  // Off to the fake Google, which agrees at once, then back here.
  await expect(page).toHaveURL(new RegExp(`/app/forms/${formId}/integrations$`));
  await expect(page.getByText('Google Sheets connected')).toBeVisible();
  await expect(card.getByText('Up to date')).toBeVisible();
  return card;
}

test('connects Google Sheets and copies responses as they arrive', async ({ page }) => {
  const problems = trackConsoleProblems(page);
  const title = `Sheets party ${Date.now()}`;
  const { formId, path } = await publishedForm(page, title);
  await respond(page, path, 'Ada');

  const card = await connectSheets(page, formId);
  await expect(card.getByText('As sheets@example.com')).toBeVisible();
  await expect(card.getByRole('link', { name: /Open sheet/ })).toHaveAttribute(
    'href',
    /docs\.google\.com\/spreadsheets/,
  );

  await expect
    .poll(async () => (await sheetTitled(page, `${title} responses`))?.rows.map((row) => row[2]))
    .toEqual(['Your name', 'Ada']);

  await respond(page, path, 'Grace');
  await expect
    .poll(async () => (await sheetTitled(page, `${title} responses`))?.rows.length)
    .toBe(3);
  expect(problems).toEqual([]);
});

test('adds a question as a new column at the end, keeping the others in place', async ({
  page,
}) => {
  const title = `Sheets columns ${Date.now()}`;
  const { formId, path } = await publishedForm(page, title);
  await respond(page, path, 'Ada');
  await connectSheets(page, formId);
  await expect
    .poll(async () => (await sheetTitled(page, `${title} responses`))?.rows.length)
    .toBe(2);
  const before = (await sheetTitled(page, `${title} responses`))?.rows[0] ?? [];

  // A new question, published: the next response brings its column.
  const current = (await (await page.request.get(`/api/forms/${formId}`)).json()) as {
    version: number;
    draftSchema: { fields: unknown[] };
  };
  const saved = await page.request.patch(`/api/forms/${formId}`, {
    data: {
      version: current.version,
      draftSchema: {
        ...current.draftSchema,
        fields: [
          ...current.draftSchema.fields,
          { id: 'fld_colour', type: 'short_text', label: 'Favourite colour', required: false },
        ],
      },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await publishViaApi(page, formId);
  const slug = path.replace('/f/', '');
  const sent = await page.request.post(`/api/public/forms/${slug}/submissions`, {
    data: { answers: { fld_name: 'Grace', fld_colour: 'Teal' } },
  });
  expect(sent.ok(), await sent.text()).toBe(true);

  await expect
    .poll(async () => (await sheetTitled(page, `${title} responses`))?.rows.length)
    .toBe(3);
  const sheet = await sheetTitled(page, `${title} responses`);
  const header = sheet?.rows[0] ?? [];
  expect(header.slice(0, before.length)).toEqual(before);
  expect(header.at(-1)).toBe('Favourite colour');
  expect(sheet?.rows[2]?.[2]).toBe('Grace');
  expect(sheet?.rows[2]?.at(-1)).toBe('Teal');
});

test('asks for a reconnect when Google access ends, then catches up', async ({ page }) => {
  const title = `Sheets reconnect ${Date.now()}`;
  const { formId, path } = await publishedForm(page, title);
  const card = await connectSheets(page, formId);

  await page.request.post(`${fake}/__revoke`);
  await respond(page, path, 'Linus');

  await page.reload();
  await expect(card.getByText('Needs reconnecting')).toBeVisible();
  await expect(card.getByRole('alert')).toContainText(/revoked or has expired/);
  const failures = page.getByRole('list', { name: 'Failed jobs' });
  await expect(failures.getByText('Add a new response')).toBeVisible();

  await connectSheets(page, formId);
  await expect
    .poll(async () => (await sheetTitled(page, `${title} responses`))?.rows.map((row) => row[2]))
    .toEqual(['Your name', 'Linus']);
  await page.reload();
  await expect(page.getByText(/Nothing has failed/)).toBeVisible();
});
