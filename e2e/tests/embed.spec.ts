import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { createFormViaApi, publishViaApi, trackConsoleProblems } from './helpers.js';

// A form embedded with embed.js on a page from another origin: it fits its content, can be
// filled in, and tells the host page when a response was sent.

/** "Someone else's site": a page on 127.0.0.1 that embeds `slug` from the dev server. */
async function startHostPage(slug: string) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Host site</title></head>
<body style="margin:0;background:#f4f4f5">
  <h1>Host site</h1>
  <div data-formyx="${slug}"></div>
  <p id="log">waiting</p>
  <script src="http://localhost:${process.env.E2E_WEB_PORT ?? '5173'}/embed.js" async></script>
  <script>
    document.addEventListener('formyx:submitted', function (event) {
      document.getElementById('log').textContent = 'submitted ' + event.detail.slug;
    });
  </script>
</body></html>`;
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

test('embeds a form in another site, sized to fit, and reports responses', async ({ page }) => {
  const problems = trackConsoleProblems(page);
  const formId = await createFormViaApi(page, 'feedback_survey');
  const publicPath = await publishViaApi(page, formId);
  const slug = publicPath.replace('/f/', '');
  const host = await startHostPage(slug);
  try {
    await page.goto(host.url);
    const iframe = page.locator(`[data-formyx="${slug}"] iframe`);
    const form = page.frameLocator(`[data-formyx="${slug}"] iframe`);

    await expect(form.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(iframe).toHaveAttribute('title', /.+/);
    // Grown from its starting 480px to the whole form and its badge, which opens a new tab.
    await expect.poll(async () => (await iframe.boundingBox())?.height ?? 0).toBeGreaterThan(600);
    await expect(
      form.getByRole('link', { name: 'Made with Formyx (opens in a new tab)' }),
    ).toHaveAttribute('target', '_blank');
    const innerHeight = await form.locator('body').evaluate((body) => body.scrollHeight);
    const outerHeight = (await iframe.boundingBox())?.height ?? 0;
    expect(Math.abs(outerHeight - innerHeight)).toBeLessThan(2);

    await form
      .getByRole('group', { name: /Overall, how satisfied/ })
      .locator('label', { hasText: /^5$/ })
      .click();
    await form
      .getByRole('group', { name: /How likely are you to recommend/ })
      .locator('label', { hasText: /^10$/ })
      .click();
    await form
      .getByRole('group', { name: /May we follow up/ })
      .locator('label', { hasText: 'No' })
      .click();
    await form.getByRole('button', { name: 'Send feedback' }).click();

    await expect(form.getByText(/Thank you!/)).toBeVisible();
    await expect(page.locator('#log')).toHaveText(`submitted ${slug}`);
    // The thank-you is shorter than the form: the iframe shrinks with it.
    await expect.poll(async () => (await iframe.boundingBox())?.height ?? 0).toBeLessThan(500);
    expect(problems).toEqual([]);
  } finally {
    await host.close();
  }
});
