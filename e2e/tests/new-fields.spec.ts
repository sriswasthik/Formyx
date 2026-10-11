import { expect, test, type Locator, type Page } from '@playwright/test';
import { createFormViaApi, publishViaApi, trackConsoleProblems } from './helpers.js';

// Sprint 12's question types, filled in on a published three-page form, uploads included
// (to the fake Cloudinary the API is pointed at in playwright.config.ts).

const FAKE_SERVICES = `http://localhost:${process.env.E2E_FAKE_PORT ?? '4590'}`;

// Chromium records from a fake microphone, and is allowed to.
test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
  permissions: ['microphone'],
});

/** Serves res.cloudinary.com from the fake, which keeps what was uploaded to it. */
async function routeDelivery(page: Page) {
  await page.route('https://res.cloudinary.com/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const response = await page.request.fetch(`${FAKE_SERVICES}/delivery${pathname}`);
    await route.fulfill({ response });
  });
}

/** A small PNG uploaded as one of the form's pictures; its delivery URL. */
async function uploadPicture(page: Page, formId: string, name: string): Promise<string> {
  const signed = await page.request.get(`/api/uploads/signature?purpose=content&formId=${formId}`);
  expect(signed.ok()).toBe(true);
  const signature = (await signed.json()) as Record<string, string | number>;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const uploaded = await page.request.post(String(signature.uploadUrl), {
    multipart: {
      file: { name, mimeType: 'image/png', buffer: png },
      api_key: String(signature.apiKey),
      timestamp: String(signature.timestamp),
      signature: String(signature.signature),
      folder: String(signature.folder),
      allowed_formats: String(signature.allowedFormats),
    },
  });
  expect(uploaded.ok()).toBe(true);
  return ((await uploaded.json()) as { secure_url: string }).secure_url;
}

const option = (id: string, label: string) => ({ id, label });

/** Picks a radio or checkbox the way people do: its inputs are drawn by their labels. */
async function pick(input: Locator) {
  await input.locator('xpath=ancestor::label[1]').click();
  await expect(input).toBeChecked();
}

async function publishNewFieldsForm(page: Page): Promise<{ formId: string; path: string }> {
  const formId = await createFormViaApi(page, 'blank');
  const [red, blue, banner] = await Promise.all([
    uploadPicture(page, formId, 'red.png'),
    uploadPicture(page, formId, 'blue.png'),
    uploadPicture(page, formId, 'banner.png'),
  ]);
  const base = { required: false };
  const fields = [
    {
      ...base,
      id: 'fld_colour',
      type: 'picture_choice',
      label: 'Favourite colour',
      multiple: false,
      options: [
        { ...option('opt_red', 'Red'), imageUrl: red },
        { ...option('opt_blue', 'Blue'), imageUrl: blue },
      ],
    },
    { ...base, id: 'fld_return', type: 'yes_no', label: 'Would you come back?' },
    {
      ...base,
      id: 'fld_nps',
      type: 'nps',
      label: 'How likely are you to recommend us?',
      lowLabel: 'Not likely',
      highLabel: 'Very likely',
    },
    {
      ...base,
      id: 'fld_opinion',
      type: 'opinion_scale',
      label: 'The checkout was easy',
      start: 1,
      end: 5,
      lowLabel: 'Disagree',
      middleLabel: '',
      highLabel: 'Agree',
    },
    {
      ...base,
      id: 'fld_weight',
      type: 'slider',
      label: 'Parcel weight',
      min: 0,
      max: 100,
      step: 1,
      unit: 'kg',
    },
    {
      ...base,
      id: 'fld_stars',
      type: 'rating',
      label: 'Rate the food',
      ratingScale: 5,
      ratingStyle: 'stars',
    },
    {
      ...base,
      id: 'fld_rank',
      type: 'ranking',
      label: 'What matters most?',
      options: [option('opt_price', 'Price'), option('opt_speed', 'Speed')],
    },
    {
      ...base,
      id: 'fld_grid',
      type: 'matrix',
      label: 'Rate each part',
      multiple: false,
      rows: [option('row_food', 'Food'), option('row_service', 'Service')],
      columns: [option('col_poor', 'Poor'), option('col_good', 'Good')],
    },
    { ...base, id: 'fld_page2', type: 'page_break', label: 'How to reach you' },
    { ...base, id: 'fld_phone', type: 'phone', label: 'Phone', defaultCountry: 'IN' },
    { ...base, id: 'fld_address', type: 'address', label: 'Address' },
    { ...base, id: 'fld_time', type: 'time', label: 'Best time to call' },
    { ...base, id: 'fld_dates', type: 'date_range', label: 'Travel dates' },
    { ...base, id: 'fld_site', type: 'url', label: 'Website' },
    { ...base, id: 'fld_budget', type: 'currency', label: 'Budget', currency: 'INR' },
    { ...base, id: 'fld_brand', type: 'color', label: 'Brand colour' },
    { ...base, id: 'fld_page3', type: 'page_break', label: 'Almost done' },
    { ...base, id: 'fld_intro', type: 'statement', label: 'Thanks for **sticking with us**.' },
    {
      ...base,
      id: 'fld_banner',
      type: 'image',
      label: '',
      imageUrl: banner,
      alt: 'Our shop',
      width: 'medium',
    },
    {
      ...base,
      id: 'fld_video',
      type: 'video',
      label: 'Our story',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    },
    { ...base, id: 'fld_line', type: 'divider', label: '' },
    { ...base, id: 'fld_sign', type: 'signature', label: 'Sign here' },
    {
      ...base,
      id: 'fld_voice',
      type: 'voice_note',
      label: 'Leave a voice note',
      maxDurationSeconds: 30,
    },
    {
      id: 'fld_terms',
      type: 'consent',
      label: 'I agree to the terms',
      required: true,
      terms: 'Read our [privacy policy](https://formyx.app/privacy).',
    },
    { ...base, id: 'fld_source', type: 'hidden', label: 'Source', paramName: 'source' },
  ];

  const current = await page.request.get(`/api/forms/${formId}`);
  const form = (await current.json()) as { version: number; draftSchema: Record<string, unknown> };
  const saved = await page.request.patch(`/api/forms/${formId}`, {
    data: {
      version: form.version,
      title: 'Every new question',
      draftSchema: { ...form.draftSchema, fields },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return { formId, path: await publishViaApi(page, formId) };
}

test('fills in a form with every new question type', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const problems = trackConsoleProblems(page);
  await routeDelivery(page);
  const { formId, path } = await publishNewFieldsForm(page);
  await page.goto(`${path}?source=e2e-newsletter`);

  // Page 1: choices and scales.
  await expect(page.getByRole('heading', { level: 1, name: 'Every new question' })).toBeVisible();
  await page.getByText('Blue', { exact: true }).click();
  await pick(page.getByRole('radio', { name: 'Yes' }));
  const scale = (name: string | RegExp) => page.getByRole('group', { name });
  await pick(scale(/recommend us/).getByRole('radio', { name: '9', exact: true }));
  await pick(scale(/checkout was easy/).getByRole('radio', { name: '4', exact: true }));
  const slider = page.getByRole('slider', { name: 'Parcel weight' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '51 kg');
  await pick(page.getByRole('radio', { name: '4 of 5' }));
  await page.getByRole('button', { name: 'Move Speed up' }).click();
  for (const [row, column] of [
    ['Food', 'Good'],
    ['Service', 'Poor'],
  ] as const) {
    await pick(
      page
        .getByRole('radio', { name: `${row}: ${column}` })
        .or(page.getByRole('group', { name: row }).getByRole('radio', { name: column })),
    );
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Page 2: contact details; the PIN code fills in the city and state.
  await expect(page.getByRole('heading', { name: 'How to reach you' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Phone' }).fill('98765 43210');
  const address = page.getByRole('group', { name: 'Address' });
  await address.getByRole('textbox', { name: 'Address line 1' }).fill('12 MG Road');
  await address.getByRole('textbox', { name: 'PIN code' }).fill('560001');
  await expect(address.getByRole('textbox', { name: 'City' })).toHaveValue('Bengaluru');
  await expect(address.getByRole('combobox', { name: 'State' })).toHaveValue('Karnataka');
  await page.getByLabel('Best time to call').fill('14:30');
  const dates = page.getByRole('group', { name: 'Travel dates' });
  await dates.getByLabel('From').fill('2026-12-20');
  await dates.getByLabel('To').fill('2026-12-27');
  await page.getByRole('textbox', { name: 'Website' }).fill('formyx.app');
  await page.getByRole('textbox', { name: 'Budget' }).fill('25000');
  await page.getByRole('textbox', { name: 'Brand colour' }).fill('#2E5AAC');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Page 3: content, a typed signature, a recorded voice note and consent.
  await expect(page.getByRole('heading', { name: 'Almost done' })).toBeVisible();
  await expect(page.locator('strong', { hasText: 'sticking with us' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Our shop' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Our story' })).toBeVisible();
  const signature = page.getByRole('group', { name: 'Sign here' });
  await signature.getByRole('button', { name: 'Type' }).click();
  await signature.getByRole('textbox').fill('Ada Lovelace');
  await expect(signature.getByText('Signature saved')).toBeVisible();
  const voice = page.getByRole('group', { name: 'Leave a voice note' });
  await voice.getByRole('button', { name: 'Record' }).click();
  await page.waitForTimeout(1500);
  await voice.getByRole('button', { name: 'Stop' }).click();
  await expect(voice.getByText('Voice note saved')).toBeVisible();
  await pick(page.getByRole('checkbox', { name: /I agree to the terms/ }));
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Thank' })).toBeVisible();

  // The answers as stored.
  const list = await page.request.get(`/api/forms/${formId}/submissions`);
  expect(list.ok()).toBe(true);
  const { submissions } = (await list.json()) as {
    submissions: { answers: Record<string, unknown> }[];
  };
  const answers = submissions[0]?.answers ?? {};
  expect(answers).toMatchObject({
    fld_colour: 'opt_blue',
    fld_return: 'yes',
    fld_nps: 9,
    fld_opinion: 4,
    fld_weight: 51,
    fld_stars: 4,
    fld_rank: ['opt_speed', 'opt_price'],
    fld_grid: { row_food: 'col_good', row_service: 'col_poor' },
    fld_phone: '+919876543210',
    fld_address: { line1: '12 MG Road', pin: '560001', city: 'Bengaluru', state: 'Karnataka' },
    fld_time: '14:30',
    fld_dates: { start: '2026-12-20', end: '2026-12-27' },
    fld_site: 'https://formyx.app/',
    fld_budget: 25000,
    fld_brand: '#2E5AAC',
    fld_terms: true,
    fld_source: 'e2e-newsletter',
  });
  expect(answers.fld_sign).toMatchObject({ type: 'image/png' });
  expect(answers.fld_voice).toMatchObject({ type: expect.stringMatching(/^audio\//) });

  // The responses page plays the voice note back and shows the signature.
  if (testInfo.project.name === 'desktop') {
    await page.goto(`/app/forms/${formId}/responses?tab=responses`);
    await page.getByRole('row').nth(1).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('img', { name: 'Signature' })).toBeVisible();
    await expect(drawer.locator('audio')).toHaveAttribute('src', /res\.cloudinary\.com/);
    await expect(drawer.getByText('Promoter')).toBeVisible();
  }

  expect(problems).toEqual([]);
});
