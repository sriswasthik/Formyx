import { randomUUID } from 'node:crypto';
import {
  createDefaultTheme,
  createEmptyForm,
  createField,
  formSchema,
  formThemeSchema,
  migrateTheme,
  withPrimaryColor,
  type FormThemeV1,
} from '@formyx/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { migrateForms, writeIfUnchanged } from './form-migration.js';

let workspaceId: string;

beforeEach(async () => {
  await resetDatabase();
  ({ id: workspaceId } = await prisma.workspace.create({ data: { name: 'Team', slug: 'team' } }));
});

const v1Theme: FormThemeV1 = {
  accentColor: '#337B7E',
  font: 'serif',
  radius: 'sharp',
  background: 'off_white',
  logoUrl: 'https://res.cloudinary.com/demo/image/upload/logo.png',
};

const schema = {
  ...createEmptyForm(),
  fields: [{ ...createField('short_text'), label: 'Name' }],
};

const lastWeek = new Date('2026-09-27T09:00:00.000Z');

/** A form stored as an older version left it, bypassing validation. */
async function storeForm({
  theme,
  publishedTheme = null,
}: {
  theme: object;
  publishedTheme?: object | null;
}): Promise<string> {
  const form = await prisma.form.create({
    data: {
      workspaceId,
      title: 'Old form',
      slug: `old-${randomUUID()}`,
      draftSchema: schema,
      theme,
      ...(publishedTheme && {
        status: 'PUBLISHED',
        publishedSchema: schema,
        publishedTheme,
        publishedAt: lastWeek,
      }),
      version: 7,
      createdAt: lastWeek,
      updatedAt: lastWeek,
    },
  });
  return form.id;
}

const read = (id: string) => prisma.form.findUniqueOrThrow({ where: { id } });

describe('migrateForms', () => {
  it('upgrades v1 themes and their published snapshots to v2', async () => {
    const id = await storeForm({ theme: v1Theme, publishedTheme: v1Theme });

    const report = await migrateForms(prisma);

    expect(report).toEqual({ checked: 1, updated: 1, skipped: 0, failed: [] });
    const form = await read(id);
    expect(form.theme).toEqual(migrateTheme(v1Theme));
    expect(form.publishedTheme).toEqual(migrateTheme(v1Theme));
    expect(formThemeSchema.safeParse(form.theme).success).toBe(true);
    // The questions were current already.
    expect(formSchema.parse(form.draftSchema)).toEqual(schema);
  });

  it('is not an edit: the version and last-edited time stay', async () => {
    const id = await storeForm({ theme: v1Theme });
    await migrateForms(prisma);
    expect(await read(id)).toMatchObject({ version: 7, updatedAt: lastWeek });
  });

  it('leaves current forms alone, so running it again changes nothing', async () => {
    await storeForm({ theme: createDefaultTheme(), publishedTheme: createDefaultTheme() });
    await storeForm({ theme: v1Theme });

    expect(await migrateForms(prisma)).toMatchObject({ checked: 2, updated: 1 });
    expect(await migrateForms(prisma)).toEqual({ checked: 2, updated: 0, skipped: 0, failed: [] });
  });

  it('reports forms it cannot read and carries on with the rest', async () => {
    const broken = await storeForm({ theme: { accentColor: 'teal' } });
    const fine = await storeForm({ theme: v1Theme });

    const report = await migrateForms(prisma);

    expect(report).toMatchObject({ checked: 2, updated: 1 });
    expect(report.failed).toEqual([
      { formId: broken, column: 'theme', message: expect.any(String) as string },
    ]);
    expect((await read(broken)).theme).toEqual({ accentColor: 'teal' });
    expect((await read(fine)).theme).toEqual(migrateTheme(v1Theme));
  });

  it('only reports in a dry run', async () => {
    const id = await storeForm({ theme: v1Theme });
    expect(await migrateForms(prisma, { dryRun: true })).toMatchObject({ checked: 1, updated: 1 });
    expect((await read(id)).theme).toEqual(v1Theme);
  });

  it('works through the forms a batch at a time', async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await storeForm({ theme: v1Theme }));

    expect(await migrateForms(prisma, { batchSize: 2 })).toMatchObject({ checked: 5, updated: 5 });
    for (const id of ids) expect((await read(id)).theme).toEqual(migrateTheme(v1Theme));
  });
});

describe('writeIfUnchanged', () => {
  it('never overwrites a form saved in the meantime', async () => {
    const id = await storeForm({ theme: v1Theme });
    const original = await read(id);
    const editorsTheme = withPrimaryColor(createDefaultTheme(), '#B1563B');
    await prisma.form.update({ where: { id }, data: { theme: editorsTheme } });

    const written = await writeIfUnchanged(prisma, original, {
      ...original,
      theme: migrateTheme(v1Theme),
    });

    expect(written).toBe(false);
    expect((await read(id)).theme).toEqual(editorsTheme);
  });
});
