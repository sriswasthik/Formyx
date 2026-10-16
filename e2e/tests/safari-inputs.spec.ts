import { expect, test, type Page } from '@playwright/test';
import { createFormViaApi, publishViaApi, trackConsoleProblems } from './helpers.js';

// The inputs that differ most between browsers, in WebKit (Safari's engine): dates, files,
// a drawn signature and a voice note. Runs in the `webkit` project only.
//
// Playwright's WebKit varies by platform: on Windows it has no MediaRecorder, microphone or
// native date picker, where Safari on a Mac or iPhone has all three. So the voice note is
// recorded where the engine can record, and otherwise must say so and let the form be sent.

async function publishInputsForm(page: Page): Promise<string> {
  const formId = await createFormViaApi(page, 'blank');
  const current = await page.request.get(`/api/forms/${formId}`);
  const form = (await current.json()) as { version: number; draftSchema: Record<string, unknown> };
  const fields = [
    { id: 'fld_day', type: 'date', label: 'Your birthday', required: false },
    {
      id: 'fld_cv',
      type: 'file',
      label: 'Your CV',
      required: false,
      fileConfig: { maxSizeMb: 2, allowedTypes: ['pdf'] },
    },
    { id: 'fld_sign', type: 'signature', label: 'Sign here', required: false },
    {
      id: 'fld_voice',
      type: 'voice_note',
      label: 'Leave a voice note',
      required: false,
      maxDurationSeconds: 30,
    },
  ];
  const saved = await page.request.patch(`/api/forms/${formId}`, {
    data: {
      version: form.version,
      title: 'Safari inputs',
      draftSchema: { ...form.draftSchema, fields },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return publishViaApi(page, formId);
}

test('fills in dates, files, a drawn signature and a voice note in WebKit', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const problems = trackConsoleProblems(page);
  const path = await publishInputsForm(page);
  await context.grantPermissions(['microphone']).catch(() => undefined);
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: 'Safari inputs' })).toBeVisible();

  // A date: the native picker where there is one, typed (as ISO) where WebKit has none.
  const day = page.getByLabel('Your birthday');
  await day.fill('1990-12-10');
  await expect(day).toHaveValue('1990-12-10');

  // A file, uploaded straight to storage.
  await page.getByLabel('Your CV').setInputFiles({
    name: 'cv.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% Formyx WebKit test\n'),
  });
  await expect(page.getByText('cv.pdf uploaded')).toBeVisible();

  // A signature, drawn with the pointer.
  const pad = page.getByLabel(/Signature pad/);
  const box = await pad.boundingBox();
  if (!box) throw new Error('The signature pad has no size');
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(box.x + 20 + step * 20, box.y + box.height / 2 + (step % 2 ? 12 : -12));
  }
  await page.mouse.up();
  await expect(
    page.getByRole('group', { name: 'Sign here' }).getByText('Signature saved'),
  ).toBeVisible();

  // A voice note, where this WebKit can record one.
  const voice = page.getByRole('group', { name: 'Leave a voice note' });
  const canRecord = await page.evaluate(
    () => typeof MediaRecorder !== 'undefined' && 'mediaDevices' in navigator,
  );
  await voice.getByRole('button', { name: 'Record' }).click();
  if (canRecord) {
    await page.waitForTimeout(1500);
    await voice.getByRole('button', { name: 'Stop' }).click();
    await expect(voice.getByText('Voice note saved')).toBeVisible();
  } else {
    await expect(voice.getByText('This browser cannot record audio.')).toBeVisible();
  }

  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Thank' })).toBeVisible();
  expect(problems).toEqual([]);
});
