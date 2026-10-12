import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { createFormViaApi, publishViaApi, trackConsoleProblems } from './helpers.js';

// Adding a webhook, testing it, and receiving a real response, signed.

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
}

/** Someone's webhook endpoint, on this machine. */
async function startReceiver() {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      res.end('ok');
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/hooks/formyx`,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

/** What a receiver should do: recompute the signature over the raw body and compare. */
function signedBy(request: Received, secret: string): boolean {
  const expected = Buffer.from(
    `sha256=${createHmac('sha256', secret).update(request.body).digest('hex')}`,
  );
  const given = Buffer.from(String(request.headers['x-formyx-signature']));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

test('adds a webhook, sends a test event and delivers a real response', async ({
  page,
  context,
}) => {
  const problems = trackConsoleProblems(page);
  const receiver = await startReceiver();
  try {
    const formId = await createFormViaApi(page, 'feedback_survey');
    const publicPath = await publishViaApi(page, formId);
    // Webhooks live on the form's Integrations page.
    await page.goto(`/app/forms/${formId}/integrations`);
    await page.getByRole('button', { name: 'Add a webhook' }).click();
    const sheet = page.getByRole('dialog', { name: 'Webhooks' });
    await sheet.getByRole('textbox', { name: 'Endpoint URL' }).fill(receiver.url);
    await sheet.getByRole('button', { name: 'Add webhook' }).click();

    const secret = await sheet.getByRole('textbox', { name: 'Signing secret' }).inputValue();
    expect(secret).toMatch(/^whsec_/);
    await sheet.getByRole('button', { name: 'I’ve saved it' }).click();
    await expect(sheet.getByRole('textbox', { name: 'Signing secret' })).toHaveCount(0);

    await sheet.getByRole('button', { name: 'Send test event' }).click();
    await expect(page.getByText('Test event delivered (200)')).toBeVisible();
    await expect(sheet.getByText('Delivered · 200')).toBeVisible();
    const [testEvent] = receiver.received;
    if (!testEvent) throw new Error('The test event did not arrive');
    expect(testEvent.headers['x-formyx-event']).toBe('test');
    expect(signedBy(testEvent, secret)).toBe(true);

    // A respondent answers; the response arrives signed, with readable answers.
    const respondent = await context.newPage();
    await respondent.goto(publicPath);
    await respondent
      .getByRole('group', { name: /Overall, how satisfied/ })
      .locator('label', { hasText: /^4$/ })
      .click();
    await respondent
      .getByRole('group', { name: /How likely are you to recommend/ })
      .locator('label', { hasText: /^8$/ })
      .click();
    await respondent
      .getByRole('group', { name: /May we follow up/ })
      .locator('label', { hasText: 'No' })
      .click();
    await respondent.getByRole('button', { name: 'Send feedback' }).click();
    await expect(respondent.getByText(/Thank you!/)).toBeVisible();
    await respondent.close();

    await expect.poll(() => receiver.received.length, { timeout: 10_000 }).toBe(2);
    const [, response] = receiver.received;
    if (!response) throw new Error('The response did not arrive');
    expect(response.headers['x-formyx-event']).toBe('submission.created');
    expect(signedBy(response, secret)).toBe(true);
    const payload = JSON.parse(response.body) as {
      form: { id: string };
      submission: { answers: { text: string }[] };
    };
    expect(payload.form.id).toBe(formId);
    expect(payload.submission.answers.map(({ text }) => text)).toContain('No');

    await sheet.getByRole('button', { name: 'Delivery log' }).click();
    await expect(sheet.getByRole('list', { name: 'Deliveries' }).getByRole('listitem')).toHaveCount(
      2,
    );
    expect(problems).toEqual([]);
  } finally {
    await receiver.close();
  }
});
