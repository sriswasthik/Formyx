import {
  apiErrorSchema,
  applyBrandKit,
  brandKitFromTheme,
  brandKitSchema,
  brandKitsResponseSchema,
  createDefaultTheme,
  formDetailSchema,
  THEME_PRESETS,
  type BrandKitData,
  type FormTheme,
} from '@formyx/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createFakeCloudinary } from '../test/fake-cloudinary.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

const cloud = createFakeCloudinary();
const app = createTestApp({}, { storage: cloud.storage });
const enforcedApp = createTestApp({ ENTITLEMENTS_MODE: 'enforced' }, { storage: cloud.storage });
let team: Team;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

function preset(id: string): FormTheme {
  const found = THEME_PRESETS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown preset: ${id}`);
  return found.theme;
}

const paperKit: BrandKitData = brandKitFromTheme(preset('paper'));
const kitsPath = () => `/api/workspaces/${team.workspaceId}/brand-kits`;
const defaultPath = () => `/api/workspaces/${team.workspaceId}/default-brand-kit`;
const errorOf = (body: unknown) => apiErrorSchema.parse(body).error;

async function createKit(name = 'Acme', kit: BrandKitData = paperKit) {
  const res = await requestAs(app, team.users.EDITOR).post(kitsPath(), { name, kit }).expect(201);
  return brandKitSchema.parse(res.body);
}

async function newForm(userId = team.users.EDITOR) {
  const res = await requestAs(app, userId)
    .post(`/api/workspaces/${team.workspaceId}/forms`, {})
    .expect(201);
  return formDetailSchema.parse(res.body);
}

describe('brand kits', () => {
  it('saves, lists newest first, renames and deletes kits', async () => {
    const first = await createKit('First');
    const second = await createKit('Second', brandKitFromTheme(preset('midnight')));
    expect(first.kit).toEqual(paperKit);

    const list = brandKitsResponseSchema.parse(
      (await requestAs(app, team.users.VIEWER).get(kitsPath()).expect(200)).body,
    );
    expect(list.brandKits.map((kit) => kit.name)).toEqual(['Second', 'First']);
    expect(list.defaultBrandKitId).toBeNull();

    const renamed = await requestAs(app, team.users.EDITOR)
      .patch(`${kitsPath()}/${first.id}`, { name: '  Renamed  ' })
      .expect(200);
    expect(brandKitSchema.parse(renamed.body)).toMatchObject({ name: 'Renamed', kit: paperKit });

    await requestAs(app, team.users.EDITOR).delete(`${kitsPath()}/${second.id}`).expect(204);
    const after = brandKitsResponseSchema.parse(
      (await requestAs(app, team.users.EDITOR).get(kitsPath()).expect(200)).body,
    );
    expect(after.brandKits.map((kit) => kit.id)).toEqual([first.id]);
  });

  it('lets viewers look but not change anything', async () => {
    const kit = await createKit();
    const viewer = requestAs(app, team.users.VIEWER);
    await viewer.post(kitsPath(), { name: 'Mine', kit: paperKit }).expect(403);
    await viewer.patch(`${kitsPath()}/${kit.id}`, { name: 'Mine' }).expect(403);
    await viewer.delete(`${kitsPath()}/${kit.id}`).expect(403);
    await viewer.put(defaultPath(), { brandKitId: kit.id }).expect(403);
  });

  it('keeps kits to their workspace', async () => {
    const kit = await createKit();
    const other = await prisma.workspace.create({ data: { name: 'Other', slug: 'other' } });
    await prisma.membership.create({
      data: { userId: team.users.EDITOR, workspaceId: other.id, role: 'OWNER' },
    });
    const otherKits = `/api/workspaces/${other.id}/brand-kits`;
    await requestAs(app, team.users.EDITOR)
      .patch(`${otherKits}/${kit.id}`, { name: 'Taken' })
      .expect(404);
    await requestAs(app, team.users.EDITOR)
      .put(`/api/workspaces/${other.id}/default-brand-kit`, { brandKitId: kit.id })
      .expect(404);
  });

  it('checks the kit', async () => {
    const res = await requestAs(app, team.users.EDITOR)
      .post(kitsPath(), { name: '', kit: { ...paperKit, headingFont: 'comic-sans' } })
      .expect(400);
    expect(errorOf(res.body).code).toBe('VALIDATION_ERROR');
  });

  it('takes a logo uploaded to one of the workspace’s forms, and no other', async () => {
    const form = await newForm();
    const logo = cloud.upload(`formyx/themes/${form.id}`, {
      name: 'logo.png',
      bytes: 2000,
      format: 'png',
    });
    const saved = await createKit('With logo', { ...paperKit, logoUrl: logo.url });
    expect(saved.kit.logoUrl).toBe(logo.url);

    const elsewhere = cloud.upload('formyx/themes/form_elsewhere', {
      name: 'logo.png',
      bytes: 2000,
      format: 'png',
    });
    for (const logoUrl of [elsewhere.url, 'https://evil.example/logo.png']) {
      const res = await requestAs(app, team.users.EDITOR)
        .post(kitsPath(), { name: 'Sneaky', kit: { ...paperKit, logoUrl } })
        .expect(400);
      expect(errorOf(res.body).code).toBe('VALIDATION_ERROR');
    }
  });

  it('stops at the plan’s limit when limits are enforced', async () => {
    const editor = requestAs(enforcedApp, team.users.EDITOR);
    await editor.post(kitsPath(), { name: 'One', kit: paperKit }).expect(201);
    const res = await editor.post(kitsPath(), { name: 'Two', kit: paperKit }).expect(403);
    expect(errorOf(res.body)).toMatchObject({
      code: 'LIMIT_REACHED',
      details: { limit: 'brand_kits', max: 1 },
    });

    await prisma.workspace.update({ where: { id: team.workspaceId }, data: { plan: 'PRO' } });
    await editor.post(kitsPath(), { name: 'Two', kit: paperKit }).expect(201);
  });
});

describe('the default brand kit', () => {
  it('starts new forms in the kit, until it is cleared', async () => {
    const kit = await createKit('Midnight', brandKitFromTheme(preset('midnight')));
    const set = await requestAs(app, team.users.EDITOR)
      .put(defaultPath(), { brandKitId: kit.id })
      .expect(200);
    expect(brandKitsResponseSchema.parse(set.body).defaultBrandKitId).toBe(kit.id);

    const branded = await newForm();
    expect(branded.theme).toEqual(applyBrandKit(createDefaultTheme(), kit.kit));
    expect(branded.theme.colors).toEqual(kit.kit.colors);

    await requestAs(app, team.users.EDITOR).put(defaultPath(), { brandKitId: null }).expect(200);
    expect((await newForm()).theme).toEqual(createDefaultTheme());
  });

  it('goes back to the plain look when its kit is deleted', async () => {
    const kit = await createKit();
    await requestAs(app, team.users.EDITOR).put(defaultPath(), { brandKitId: kit.id }).expect(200);
    await requestAs(app, team.users.EDITOR).delete(`${kitsPath()}/${kit.id}`).expect(204);

    const list = brandKitsResponseSchema.parse(
      (await requestAs(app, team.users.EDITOR).get(kitsPath()).expect(200)).body,
    );
    expect(list.defaultBrandKitId).toBeNull();
    expect((await newForm()).theme).toEqual(createDefaultTheme());
  });

  it('lets forms take on a kit’s logo from another form', async () => {
    const source = await newForm();
    const logo = cloud.upload(`formyx/themes/${source.id}`, {
      name: 'logo.png',
      bytes: 2000,
      format: 'png',
    });
    const kit = await createKit('Logo', { ...paperKit, logoUrl: logo.url });

    const target = await newForm();
    const theme = applyBrandKit(target.theme, kit.kit);
    const saved = await requestAs(app, team.users.EDITOR)
      .patch(`/api/forms/${target.id}`, { version: target.version, theme })
      .expect(200);
    expect(formDetailSchema.parse(saved.body).theme.branding.logoUrl).toBe(logo.url);
  });
});
