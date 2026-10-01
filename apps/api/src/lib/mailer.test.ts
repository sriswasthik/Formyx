import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeMailer } from '../test/create-test-app.js';
import { createMailer, createOutboxMailer } from './mailer.js';

const silent = pino({ level: 'silent' });
const message = { to: 'ada@example.com', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' };
const folders: string[] = [];

async function tempFolder() {
  const folder = await mkdtemp(join(tmpdir(), 'formyx-outbox-'));
  folders.push(folder);
  return folder;
}

afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

describe('createOutboxMailer', () => {
  it('saves each send as JSON, in order, and passes it on', async () => {
    const folder = join(await tempFolder(), 'outbox');
    const next = createFakeMailer();
    const mailer = createOutboxMailer(folder, next);

    await mailer.send([message], { idempotencyKey: 'invite/inv_1/abc' });
    await mailer.send([{ ...message, subject: 'Again' }], { idempotencyKey: 'invite/inv_1/def' });

    const files = (await readdir(folder)).sort();
    expect(files).toHaveLength(2);
    expect(files[0]).toMatch(/^\d+-0001-invite_inv_1_abc\.json$/);
    const first = JSON.parse(await readFile(join(folder, files[0] ?? ''), 'utf8')) as unknown;
    expect(first).toEqual({ messages: [message] });
    expect(next.sent.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      'invite/inv_1/abc',
      'invite/inv_1/def',
    ]);
  });
});

describe('createMailer', () => {
  const base = { RESEND_API_KEY: undefined, EMAIL_FROM: 'Formyx <x@formyx.app>' };

  it('writes to the outbox in development, never in production', async () => {
    const folder = await tempFolder();

    await createMailer({ ...base, NODE_ENV: 'development', EMAIL_OUTBOX_DIR: folder }, silent).send(
      [message],
      { idempotencyKey: 'k1' },
    );
    expect(await readdir(folder)).toHaveLength(1);

    await createMailer({ ...base, NODE_ENV: 'production', EMAIL_OUTBOX_DIR: folder }, silent).send(
      [message],
      { idempotencyKey: 'k2' },
    );
    expect(await readdir(folder)).toHaveLength(1);
  });
});
