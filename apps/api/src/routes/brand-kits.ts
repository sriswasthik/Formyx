import {
  brandKitInputSchema,
  brandKitUpdateSchema,
  defaultBrandKitInputSchema,
  type BrandKit,
  type BrandKitData,
  type BrandKitsResponse,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { AppError } from '../lib/app-error.js';
import { routeParam } from '../lib/route-param.js';
import { getAuth, getMembership, type AuthGuards } from '../middleware/auth.js';
import { createBrandKitService } from '../services/brand-kit-service.js';
import { createEntitlementService } from '../services/entitlement-service.js';
import { createUploadChecks } from '../services/upload-checks.js';

/**
 * A workspace's brand kits. Every member sees them; saving, changing, deleting them and
 * choosing the one new forms start with take EDITOR or above.
 */
export function createBrandKitsRouter(
  { prisma, env, storage }: AppDependencies,
  { requireAuth, requireWorkspaceRole }: AuthGuards,
): Router {
  const router = Router();
  const kits = createBrandKitService(
    prisma,
    createEntitlementService(prisma, env.ENTITLEMENTS_MODE),
  );
  const uploads = createUploadChecks({ storage, root: env.CLOUDINARY_FOLDER });

  /**
   * A kit's logo must be one uploaded for a form in this workspace, so a kit cannot carry
   * another workspace's images (or any image at all) into forms.
   */
  async function checkLogo(workspaceId: string, kit: BrandKitData | undefined): Promise<void> {
    if (!kit?.logoUrl) return;
    const formId = uploads.themeImageFormId(kit.logoUrl);
    const form =
      formId &&
      (await prisma.form.findFirst({ where: { id: formId, workspaceId }, select: { id: true } }));
    if (!form) {
      const message = 'Use a logo uploaded to one of this workspace’s forms.';
      throw new AppError(400, 'VALIDATION_ERROR', message, {
        details: [{ path: 'kit.logoUrl', message }],
      });
    }
    await uploads.verifyThemeImage(form.id, kit.logoUrl);
  }

  router.use('/workspaces/:workspaceId/brand-kits', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get(
    '/workspaces/:workspaceId/brand-kits',
    requireAuth,
    requireWorkspaceRole('VIEWER'),
    async (req, res) => {
      const body: BrandKitsResponse = await kits.list(getMembership(req).workspaceId);
      res.json(body);
    },
  );

  router.post(
    '/workspaces/:workspaceId/brand-kits',
    requireAuth,
    requireWorkspaceRole('EDITOR'),
    async (req, res) => {
      const input = brandKitInputSchema.parse(req.body);
      const { workspaceId } = getMembership(req);
      await checkLogo(workspaceId, input.kit);
      const body: BrandKit = await kits.create(workspaceId, getAuth(req).userId, input);
      res.status(201).json(body);
    },
  );

  router.patch(
    '/workspaces/:workspaceId/brand-kits/:brandKitId',
    requireAuth,
    requireWorkspaceRole('EDITOR'),
    async (req, res) => {
      const patch = brandKitUpdateSchema.parse(req.body);
      const { workspaceId } = getMembership(req);
      await checkLogo(workspaceId, patch.kit);
      const body: BrandKit = await kits.update(workspaceId, routeParam(req, 'brandKitId'), patch);
      res.json(body);
    },
  );

  router.delete(
    '/workspaces/:workspaceId/brand-kits/:brandKitId',
    requireAuth,
    requireWorkspaceRole('EDITOR'),
    async (req, res) => {
      await kits.remove(getMembership(req).workspaceId, routeParam(req, 'brandKitId'));
      res.status(204).end();
    },
  );

  router.put(
    '/workspaces/:workspaceId/default-brand-kit',
    requireAuth,
    requireWorkspaceRole('EDITOR'),
    async (req, res) => {
      const { brandKitId } = defaultBrandKitInputSchema.parse(req.body);
      res.set('Cache-Control', 'no-store');
      const body: BrandKitsResponse = await kits.setDefault(
        getMembership(req).workspaceId,
        brandKitId,
      );
      res.json(body);
    },
  );

  return router;
}
