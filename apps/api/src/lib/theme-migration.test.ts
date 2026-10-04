import { readFileSync } from 'node:fs';
import { createEmptyForm, formThemeV1Schema } from '@formyx/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';

/** The data part of the themes migration: everything after adding the column. */
const MIGRATION = readFileSync(
  new URL('../../prisma/migrations/20261001083547_themes/migration.sql', import.meta.url),
  'utf8',
);
const statements = MIGRATION.slice(MIGRATION.indexOf('-- Themes move'))
  .split(/;\s*$/m)
  .map((statement) => statement.trim())
  .filter(Boolean);

let workspaceId: string;

beforeEach(async () => {
  await resetDatabase();
  ({ id: workspaceId } = await prisma.workspace.create({ data: { name: 'Team', slug: 'team' } }));
});

/** A form stored with a theme from before the design panel, bypassing validation. */
async function storeOldTheme(theme: object, published: boolean): Promise<string> {
  const form = await prisma.form.create({
    data: {
      workspaceId,
      title: 'Old form',
      slug: `old-${Math.random().toString(36).slice(2)}`,
      draftSchema: createEmptyForm(),
      ...(published && { publishedSchema: createEmptyForm(), status: 'PUBLISHED' }),
      theme,
    },
  });
  return form.id;
}

async function migrate() {
  for (const statement of statements) await prisma.$executeRawUnsafe(statement);
}

describe('the themes migration', () => {
  it('maps old themes onto the new choices', async () => {
    const cases = [
      {
        old: { accentColor: '#2E5AAC', font: 'inter', radius: 'medium', background: '#FFFFFF' },
        expected: { accentColor: '#4370BD', font: 'inter', radius: 'rounded', background: 'white' },
      },
      {
        old: { accentColor: '#b1563b', font: 'mono', radius: 'none', background: '#18181B' },
        expected: { accentColor: '#B1563B', font: 'inter', radius: 'sharp', background: 'dark' },
      },
      {
        old: {
          accentColor: '#337B7E',
          font: 'serif',
          radius: 'large',
          background: '#F5F1E8',
          logoUrl: 'https://res.cloudinary.com/demo/image/upload/logo.png',
        },
        expected: {
          accentColor: '#337B7E',
          font: 'serif',
          radius: 'rounded',
          background: 'off_white',
          logoUrl: 'https://res.cloudinary.com/demo/image/upload/logo.png',
        },
      },
    ];
    const ids = [];
    for (const { old } of cases) ids.push(await storeOldTheme(old, false));

    await migrate();

    for (const [index, id] of ids.entries()) {
      const { theme, publishedTheme } = await prisma.form.findUniqueOrThrow({ where: { id } });
      expect(theme).toEqual(cases[index]?.expected);
      expect(formThemeV1Schema.safeParse(theme).success).toBe(true);
      expect(publishedTheme).toBeNull();
    }
  });

  it('gives published forms the theme respondents already see', async () => {
    const id = await storeOldTheme(
      { accentColor: '#2E5AAC', font: 'system', radius: 'small', background: '#FFFFFF' },
      true,
    );

    await migrate();

    const { theme, publishedTheme } = await prisma.form.findUniqueOrThrow({ where: { id } });
    expect(publishedTheme).toEqual(theme);
  });
});
