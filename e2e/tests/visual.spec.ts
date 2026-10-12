import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { applyPreset, createFormViaApi, publishViaApi } from './helpers.js';

// Visual regression: every theme preset, drawn on the same form, compared with screenshots
// taken on Linux in CI (fonts render differently on each system, so other systems skip).
// Runs only as the visual-* projects (E2E_VISUAL=1). After an intended change, update the
// baselines with the "Visual baselines" workflow and commit what it uploads.

/** Every preset, as the Design Studio names it. The first test checks none is missing. */
const PRESETS = [
  'Minimal',
  'Paper',
  'Midnight',
  'Sea glass',
  'Studio',
  'Editorial',
  'Sunrise mesh',
  'Blueprint grid',
  'Confetti party',
  'Botanical',
  'Pastel blobs',
  'Minimal mono',
];

const slugOf = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

test.beforeEach(({ page: _ }, testInfo) => {
  // E2E_VISUAL_ANY_OS=1 runs them elsewhere, to look at the shots (never commit those).
  test.skip(
    process.platform !== 'linux' && !process.env.E2E_VISUAL_ANY_OS,
    'Baselines are drawn on Linux, in CI',
  );
  const updating = testInfo.config.updateSnapshots === 'all';
  const baseline = testInfo.snapshotPath(
    `${slugOf(testInfo.title.replace(/^preset /, ''))}-top.png`,
  );
  test.skip(
    !updating && testInfo.title.startsWith('preset ') && !existsSync(baseline),
    'No baseline yet: run the "Visual baselines" workflow and commit its screenshots',
  );
});

test('the list covers every preset in the Design Studio', async ({ page }) => {
  const formId = await createFormViaApi(page, 'blank');
  await page.goto(`/app/forms/${formId}/edit`);
  await page.getByRole('tab', { name: 'Design' }).click();
  const presets = page.getByRole('radiogroup', { name: 'Theme' });
  await expect(presets.getByRole('radio')).toHaveCount(PRESETS.length);
  for (const name of PRESETS) {
    await expect(presets.getByRole('radio', { name: new RegExp(`^${name}( Pro)?$`) })).toHaveCount(
      1,
    );
  }
});

for (const preset of PRESETS) {
  test(`preset ${preset}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // The same questions every time, from a template, under a fixed title.
    const formId = await createFormViaApi(page, 'event_registration');
    const form = (await (await page.request.get(`/api/forms/${formId}`)).json()) as {
      version: number;
    };
    await page.request.patch(`/api/forms/${formId}`, {
      data: { version: form.version, title: 'Design Systems Day' },
    });
    await applyPreset(page, formId, preset);
    await page.goto(await publishViaApi(page, formId));
    await expect(page.getByRole('heading', { level: 1, name: 'Design Systems Day' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Every background image (textures, photos) drawn before the shot.
    await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    );

    // What people see: the background stays in view as the form scrolls over it, so two
    // screens (the top and the end) rather than one full-page capture, which would leave it
    // at the top.
    const options = {
      animations: 'disabled',
      // Anti-aliasing differs a little between runs; real changes move far more.
      maxDiffPixelRatio: 0.01,
    } as const;
    await expect(page).toHaveScreenshot(`${slugOf(preset)}-top.png`, options);
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect(page.getByRole('button', { name: 'Register' })).toBeInViewport();
    await expect(page).toHaveScreenshot(`${slugOf(preset)}-end.png`, options);
  });
}
