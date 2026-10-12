import { createDefaultLiveSettings, createEmptyForm, createField } from '@formyx/shared';
import { pino } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadStorage } from '../lib/upload-storage.js';
import { createFakeMailer } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createPublishedForm, createSubmission } from '../test/responses.js';
import { createTeam, type Team } from '../test/team.js';
import { applyRetention, hourIn, pruneExpired, sendDigests } from './jobs.js';

const logger = pino({ level: 'silent' });
const name = { ...createField('short_text'), id: 'name', label: 'Your name' };
const upload = { ...createField('file'), id: 'cv', label: 'CV' };
const SCHEMA = { ...createEmptyForm(), fields: [name, upload] };
const defaults = createDefaultLiveSettings();

let team: Team;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

function fakeStorage(): UploadStorage & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    signUpload: vi.fn(),
    describe: vi.fn(),
    publicIdOf: vi.fn(),
    deleteFiles: vi.fn((urls: readonly string[]) => {
      deleted.push(...urls);
      return Promise.resolve();
    }),
  };
}

describe('hourIn', () => {
  it('reads the hour in a time zone', () => {
    const now = new Date('2026-10-12T03:30:00Z');
    expect(hourIn('Asia/Kolkata', now)).toBe(9);
    expect(hourIn('UTC', now)).toBe(3);
  });
});

describe('daily digests', () => {
  // 09:00 in Kolkata, the default time zone and digest hour.
  const now = new Date('2026-10-12T03:30:00Z');

  async function digestForm() {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA, 'Survey');
    await prisma.form.update({
      where: { id: form.id },
      data: {
        liveSettings: {
          ...defaults,
          notifications: {
            ...defaults.notifications,
            frequency: 'daily',
            emails: ['team@example.com'],
          },
        },
      },
    });
    return form;
  }

  it('sends one email listing the day’s responses, at the digest hour', async () => {
    const form = await digestForm();
    await createSubmission(prisma, form.id, {
      answers: { name: 'Ada' },
      createdAt: new Date('2026-10-12T01:00:00Z'),
    });
    await createSubmission(prisma, form.id, {
      answers: { name: 'Old' },
      createdAt: new Date('2026-10-10T01:00:00Z'),
    });
    const mailer = createFakeMailer();
    const deps = { prisma, mailer, storage: null, logger, appUrl: 'https://formyx.test' };

    await sendDigests({ ...deps, now: new Date('2026-10-12T02:30:00Z') });
    expect(mailer.send).not.toHaveBeenCalled();

    expect(await sendDigests({ ...deps, now })).toEqual({ sent: 1 });
    const message = mailer.sent[0]?.messages[0];
    expect(message).toMatchObject({ to: 'team@example.com', subject: '1 new response to Survey' });
    expect(message?.text).toContain('Your name: Ada');
    expect(message?.text).not.toContain('Old');

    // Once a day, however often the job runs.
    await sendDigests({ ...deps, now: new Date(now.getTime() + 10 * 60_000) });
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it('sends nothing on a day without responses', async () => {
    await digestForm();
    const mailer = createFakeMailer();
    await sendDigests({ prisma, mailer, storage: null, logger, appUrl: '', now });
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

describe('retention', () => {
  const now = new Date('2026-10-12T00:00:00Z');

  it('deletes responses older than the form keeps them, with their files first', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await prisma.form.update({
      where: { id: form.id },
      data: { liveSettings: { ...defaults, data: { retentionDays: 30 } } },
    });
    const file = {
      url: 'https://res.cloudinary.com/demo/raw/upload/v1/answers/cv.pdf',
      publicId: 'answers/cv.pdf',
      name: 'cv.pdf',
      size: 10,
      type: 'application/pdf',
    };
    await prisma.submission.create({
      data: {
        formId: form.id,
        answers: { name: 'Old', cv: file },
        metadata: {},
        createdAt: new Date('2026-08-01T00:00:00Z'),
      },
    });
    await createSubmission(prisma, form.id, {
      answers: { name: 'Recent' },
      createdAt: new Date('2026-10-01T00:00:00Z'),
    });
    // Another form keeps everything.
    const keeper = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await createSubmission(prisma, keeper.id, { createdAt: new Date('2020-01-01T00:00:00Z') });

    const storage = fakeStorage();
    const result = await applyRetention({
      prisma,
      mailer: createFakeMailer(),
      storage,
      logger,
      appUrl: '',
      now,
    });

    expect(result).toEqual({ deleted: 1 });
    expect(storage.deleted).toEqual([file.url]);
    const left = await prisma.submission.findMany({ select: { answers: true } });
    expect(left.map(({ answers }) => answers)).toEqual(
      expect.arrayContaining([{ name: 'Recent' }, {}]),
    );
    expect(left).toHaveLength(2);
  });
});

describe('pruneExpired', () => {
  it('removes codes and drafts past their time', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await prisma.respondentVerification.create({
      data: { formId: form.id, emailHash: 'x', codeHash: 'y', expiresAt: new Date(0) },
    });
    const result = await pruneExpired({
      prisma,
      mailer: createFakeMailer(),
      storage: null,
      logger,
      appUrl: '',
    });
    expect(result.codes).toBe(1);
  });
});
