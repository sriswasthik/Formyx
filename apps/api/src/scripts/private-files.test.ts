import { createEmptyForm, createField, type FileAnswer, type FormSchema } from '@formyx/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createFakeCloudinary, FAKE_APP_URL } from '../test/fake-cloudinary.js';
import { createPublishedForm } from '../test/responses.js';
import { createTeam, type Team } from '../test/team.js';
import { makeAnswerFilesPrivate } from './private-files.js';

const cv = { ...createField('file'), label: 'CV' };
const drawn = { ...createField('signature'), label: 'Signature' };
const name = { ...createField('short_text'), label: 'Name' };
const SCHEMA: FormSchema = { ...createEmptyForm(), fields: [name, cv, drawn] };
const options = { root: 'formyx', appUrl: FAKE_APP_URL, dryRun: false };

let team: Team;
beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

async function respond(formId: string, answers: Record<string, string | FileAnswer>) {
  return prisma.submission.create({
    data: { formId, answers, metadata: { userAgent: 'Vitest', referrer: null } },
    select: { id: true },
  });
}

const answersOf = async (id: string) =>
  (await prisma.submission.findUniqueOrThrow({ where: { id } })).answers as Record<string, unknown>;

describe('makeAnswerFilesPrivate', () => {
  it('makes old public files private and keeps their Formyx links', async () => {
    const cloud = createFakeCloudinary();
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const file = cloud.upload(`formyx/forms/${form.id}/${cv.id}`, { name: 'cv.pdf', bytes: 9 });
    const signature = cloud.upload(`formyx/forms/${form.id}/${drawn.id}`, {
      name: 'signature.png',
      bytes: 9,
      format: 'png',
    });
    const { id } = await respond(form.id, {
      [name.id]: 'Ada',
      [cv.id]: file,
      [drawn.id]: signature,
    });

    const report = await makeAnswerFilesPrivate(prisma, cloud.storage, options);

    expect(report).toEqual({ responses: 1, files: 2, missing: 0 });
    expect(cloud.deliveryOf(file.publicId)).toBe('private');
    expect(cloud.deliveryOf(signature.publicId)).toBe('private');
    const links = `${FAKE_APP_URL}/api/forms/${form.id}/files`;
    expect(await answersOf(id)).toEqual({
      [name.id]: 'Ada',
      [cv.id]: { ...file, url: `${links}/raw/${encodeURIComponent(file.publicId)}` },
      [drawn.id]: {
        ...signature,
        url: `${links}/image/${encodeURIComponent(`${signature.publicId}.png`)}`,
      },
    });

    // Running again finds nothing left to do.
    expect(await makeAnswerFilesPrivate(prisma, cloud.storage, options)).toEqual({
      responses: 0,
      files: 0,
      missing: 0,
    });
  });

  it('changes nothing in a dry run', async () => {
    const cloud = createFakeCloudinary();
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const file = cloud.upload(`formyx/forms/${form.id}/${cv.id}`, { name: 'cv.pdf', bytes: 9 });
    const { id } = await respond(form.id, { [cv.id]: file });

    const report = await makeAnswerFilesPrivate(prisma, cloud.storage, {
      ...options,
      dryRun: true,
    });

    expect(report).toEqual({ responses: 1, files: 1, missing: 0 });
    expect(cloud.deliveryOf(file.publicId)).toBe('upload');
    expect(await answersOf(id)).toEqual({ [cv.id]: file });
  });

  it('saves the link of a file an earlier, interrupted run made private', async () => {
    const cloud = createFakeCloudinary();
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const file = cloud.upload(`formyx/forms/${form.id}/${cv.id}`, { name: 'cv.pdf', bytes: 9 });
    const location = cloud.storage.locate(file.url);
    if (!location) throw new Error('The fake file should be ours');
    await cloud.storage.makePrivate(location);
    const { id } = await respond(form.id, { [cv.id]: file });

    expect(await makeAnswerFilesPrivate(prisma, cloud.storage, options)).toMatchObject({
      files: 1,
    });
    expect(await answersOf(id)).toMatchObject({
      [cv.id]: { url: expect.stringContaining(`${FAKE_APP_URL}/api/forms/`) as unknown },
    });
  });

  it('leaves files that are missing, elsewhere or another form’s', async () => {
    const cloud = createFakeCloudinary();
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const gone: FileAnswer = {
      url: `https://res.cloudinary.com/formyx-test/raw/upload/v1/formyx/forms/${form.id}/${cv.id}/x_cv.pdf`,
      publicId: `formyx/forms/${form.id}/${cv.id}/x_cv.pdf`,
      name: 'cv.pdf',
      size: 9,
      type: 'application/pdf',
    };
    const borrowed = cloud.upload(`formyx/forms/form_other/${drawn.id}`, {
      name: 's.png',
      bytes: 9,
      format: 'png',
    });
    const { id } = await respond(form.id, { [cv.id]: gone, [drawn.id]: borrowed });

    const report = await makeAnswerFilesPrivate(prisma, cloud.storage, options);

    expect(report).toEqual({ responses: 0, files: 0, missing: 1 });
    expect(cloud.deliveryOf(borrowed.publicId)).toBe('upload');
    expect(await answersOf(id)).toEqual({ [cv.id]: gone, [drawn.id]: borrowed });
  });
});
