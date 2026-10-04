import {
  apiErrorSchema,
  entitlementsSchema,
  FEATURE_IDS,
  formDetailSchema,
  THEME_PRESETS,
  upgradeRequiredDetailsSchema,
  type EntitlementsMode,
  type FeatureId,
  type FormDetail,
  type FormTheme,
  type Plan,
} from '@formyx/shared';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAuthGuards } from '../middleware/auth.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createRequireFeature } from '../middleware/require-feature.js';
import { createEntitlementService } from '../services/entitlement-service.js';
import { createTestApp, TEST_JWT_SECRET } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

const unlockedApp = createTestApp();
const enforcedApp = createTestApp({ ENTITLEMENTS_MODE: 'enforced' });
let team: Team;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

async function setPlan(plan: Plan, extra: { planStatus?: 'TRIALING'; trialEndsAt?: Date } = {}) {
  await prisma.workspace.update({ where: { id: team.workspaceId }, data: { plan, ...extra } });
}

const errorOf = (body: unknown) => apiErrorSchema.parse(body).error;

function preset(id: string): FormTheme {
  const found = THEME_PRESETS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown preset: ${id}`);
  return found.theme;
}

describe('GET /api/workspaces/:workspaceId/entitlements', () => {
  const path = () => `/api/workspaces/${team.workspaceId}/entitlements`;

  it('unlocks everything for every member by default', async () => {
    const res = await requestAs(unlockedApp, team.users.VIEWER).get(path()).expect(200);
    const entitlements = entitlementsSchema.parse(res.body);
    expect(entitlements).toMatchObject({
      mode: 'all_unlocked',
      plan: 'FREE',
      planStatus: 'ACTIVE',
    });
    expect(Object.values(entitlements.features).every(Boolean)).toBe(true);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('reports what the plan includes when enforced', async () => {
    const free = entitlementsSchema.parse(
      (await requestAs(enforcedApp, team.users.EDITOR).get(path()).expect(200)).body,
    );
    expect(free.features.mesh_gradients).toBe(false);
    expect(free.limits.responses_per_month).toBe(100);

    await setPlan('PRO');
    const pro = entitlementsSchema.parse(
      (await requestAs(enforcedApp, team.users.EDITOR).get(path()).expect(200)).body,
    );
    expect(pro).toMatchObject({ plan: 'PRO', mode: 'enforced' });
    expect(pro.features).toMatchObject({ mesh_gradients: true, ai_insights: false });
  });

  it('falls back to Free once a trial has ended', async () => {
    await setPlan('PRO', { planStatus: 'TRIALING', trialEndsAt: new Date(Date.now() - 1000) });
    const res = await requestAs(enforcedApp, team.users.OWNER).get(path()).expect(200);
    const entitlements = entitlementsSchema.parse(res.body);
    expect(entitlements).toMatchObject({ plan: 'PRO', planStatus: 'TRIALING' });
    expect(entitlements.features.premium_fonts).toBe(false);
  });

  it('is only for members', async () => {
    const outsider = await prisma.user.create({
      data: { name: 'Out', email: 'out@example.com', passwordHash: 'x' },
    });
    const res = await requestAs(unlockedApp, outsider.id).get(path()).expect(403);
    expect(errorOf(res.body).code).toBe('FORBIDDEN');
    await request(unlockedApp).get(path()).expect(401);
  });
});

describe('requireFeature', () => {
  /** A route behind the real guards that needs `featureId`. */
  function appRequiring(featureId: FeatureId, mode: EntitlementsMode) {
    const guards = createAuthGuards({ env: { JWT_SECRET: TEST_JWT_SECRET }, prisma });
    const requireFeature = createRequireFeature(createEntitlementService(prisma, mode));
    const app = express();
    app.use(cookieParser());
    app.get(
      '/workspaces/:workspaceId/thing',
      guards.requireAuth,
      guards.requireWorkspaceRole('VIEWER'),
      requireFeature(featureId),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    app.use(errorHandler);
    return app;
  }

  const call = (app: express.Express) =>
    requestAs(app, team.users.EDITOR).get(`/workspaces/${team.workspaceId}/thing`);

  describe('when enforced', () => {
    it('refuses with 403 UPGRADE_REQUIRED, naming the feature, when the plan lacks it', async () => {
      const res = await call(appRequiring('mesh_gradients', 'enforced')).expect(403);
      const error = errorOf(res.body);
      expect(error).toMatchObject({
        code: 'UPGRADE_REQUIRED',
        message: 'Your plan does not include: Mesh gradients.',
      });
      expect(upgradeRequiredDetailsSchema.parse(error.details)).toEqual({
        features: ['mesh_gradients'],
      });
    });

    it('lets the request through when the plan includes it', async () => {
      await setPlan('PRO');
      await call(appRequiring('mesh_gradients', 'enforced')).expect(200, { ok: true });
      await call(appRequiring('ai_insights', 'enforced')).expect(403);

      await setPlan('BUSINESS');
      await call(appRequiring('ai_insights', 'enforced')).expect(200);
    });
  });

  describe('when all features are unlocked', () => {
    it.each(FEATURE_IDS)('lets a Free workspace use %s', async (featureId) => {
      await call(appRequiring(featureId, 'all_unlocked')).expect(200, { ok: true });
    });
  });

  it('still checks membership first', async () => {
    const outsider = await prisma.user.create({
      data: { name: 'Out', email: 'out@example.com', passwordHash: 'x' },
    });
    const res = await requestAs(appRequiring('mesh_gradients', 'all_unlocked'), outsider.id)
      .get(`/workspaces/${team.workspaceId}/thing`)
      .expect(403);
    expect(errorOf(res.body).code).toBe('FORBIDDEN');
  });
});

describe('publishing a Pro look', () => {
  /** A complete draft styled with `theme`. */
  async function draftWith(app: express.Express, theme: FormTheme): Promise<FormDetail> {
    const editor = requestAs(app, team.users.EDITOR);
    const created = formDetailSchema.parse(
      (
        await editor
          .post(`/api/workspaces/${team.workspaceId}/forms`, { templateId: 'feedback_survey' })
          .expect(201)
      ).body,
    );
    // Saving a Pro look is never blocked: anyone may try it in the editor.
    const res = await editor
      .patch(`/api/forms/${created.id}`, { version: created.version, theme })
      .expect(200);
    return formDetailSchema.parse(res.body);
  }

  const publish = (app: express.Express, form: FormDetail) =>
    requestAs(app, team.users.EDITOR).post(`/api/forms/${form.id}/publish`, {
      version: form.version,
    });

  it('needs the features it uses when enforced', async () => {
    const draft = await draftWith(enforcedApp, preset('studio'));
    const res = await publish(enforcedApp, draft).expect(403);
    const error = errorOf(res.body);
    expect(error.code).toBe('UPGRADE_REQUIRED');
    expect(upgradeRequiredDetailsSchema.parse(error.details).features).toEqual([
      'premium_fonts',
      'premium_textures',
      'custom_shapes',
    ]);

    const unchanged = await prisma.form.findUniqueOrThrow({ where: { id: draft.id } });
    expect(unchanged).toMatchObject({
      status: 'DRAFT',
      publishedSchema: null,
      publishedTheme: null,
    });
  });

  it('goes live on a plan that includes them, with the theme snapshotted', async () => {
    await setPlan('PRO');
    const draft = await draftWith(enforcedApp, preset('sea-glass'));
    const published = formDetailSchema.parse((await publish(enforcedApp, draft).expect(200)).body);
    expect(published).toMatchObject({ status: 'PUBLISHED', publishedTheme: preset('sea-glass') });
  });

  it('publishes free looks on any plan', async () => {
    const draft = await draftWith(enforcedApp, preset('midnight'));
    await publish(enforcedApp, draft).expect(200);
  });

  it('asks for an upgrade to hide the Formyx badge', async () => {
    const theme = preset('minimal');
    const draft = await draftWith(enforcedApp, {
      ...theme,
      branding: { ...theme.branding, showFormyxBadge: false },
    });
    const res = await publish(enforcedApp, draft).expect(403);
    expect(errorOf(res.body).details).toEqual({ features: ['remove_branding'] });
  });

  it('publishes anything while all features are unlocked', async () => {
    const draft = await draftWith(unlockedApp, preset('editorial'));
    await publish(unlockedApp, draft).expect(200);
  });

  it('reports an unfinished form before the plan', async () => {
    const draft = await draftWith(enforcedApp, preset('studio'));
    const editor = requestAs(enforcedApp, team.users.EDITOR);
    const emptied = formDetailSchema.parse(
      (
        await editor
          .patch(`/api/forms/${draft.id}`, {
            version: draft.version,
            draftSchema: { ...draft.draftSchema, fields: [] },
          })
          .expect(200)
      ).body,
    );
    const res = await publish(enforcedApp, emptied).expect(422);
    expect(errorOf(res.body).code).toBe('FORM_INCOMPLETE');
  });
});
