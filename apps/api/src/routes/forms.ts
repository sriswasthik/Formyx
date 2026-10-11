import {
  createFormInputSchema,
  listFormsQuerySchema,
  publishFormInputSchema,
  schemaImageUrls,
  themeImageUrls,
  updateFormInputSchema,
  type FormDetail,
  type FormListResponse,
  type FormSchema,
  type FormTheme,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { routeParam } from '../lib/route-param.js';
import { getAuth, getMembership, type AuthGuards } from '../middleware/auth.js';
import { createBrandKitService } from '../services/brand-kit-service.js';
import { createEntitlementService } from '../services/entitlement-service.js';
import { createFormService } from '../services/form-service.js';
import { createUploadChecks } from '../services/upload-checks.js';

/**
 * Anyone in the workspace can read its forms; changing them takes EDITOR or above.
 * Routes are declared with full paths because they span two resources.
 */
export function createFormsRouter(
  { prisma, env, storage }: AppDependencies,
  { requireAuth, requireWorkspaceRole, requireFormRole }: AuthGuards,
): Router {
  const router = Router();
  const entitlements = createEntitlementService(prisma, env.ENTITLEMENTS_MODE);
  const forms = createFormService(prisma, entitlements);
  const brandKits = createBrandKitService(prisma, entitlements);
  const uploads = createUploadChecks({ storage, root: env.CLOUDINARY_FOLDER });

  /**
   * Checks images new to this form were uploaded for it: the theme's (logo, cover, image
   * layers) and the questions' (picture choices, image blocks). Logos from the workspace's
   * brand kits were checked when the kit was saved.
   */
  async function checkImages(
    formId: string,
    { theme, draftSchema }: { theme?: FormTheme | undefined; draftSchema?: FormSchema | undefined },
  ): Promise<void> {
    const urls = [
      ...(theme ? themeImageUrls(theme) : []),
      ...(draftSchema ? schemaImageUrls(draftSchema) : []),
    ];
    if (urls.length === 0) return;
    const current = await forms.get(formId);
    const known = new Set([
      ...[current.theme, current.publishedTheme].flatMap((known) =>
        known ? themeImageUrls(known) : [],
      ),
      ...[current.draftSchema, current.publishedSchema].flatMap((known) =>
        known ? schemaImageUrls(known) : [],
      ),
    ]);
    const unknown = urls.filter((url) => !known.has(url));
    if (unknown.length === 0) return;
    const kitLogos = new Set(await brandKits.logoUrls(current.workspaceId));
    for (const url of unknown) {
      if (!kitLogos.has(url)) await uploads.verifyThemeImage(formId, url);
    }
  }

  // Form data is private to the workspace: keep it out of shared caches.
  router.use(['/workspaces/:workspaceId/forms', '/forms'], (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get(
    '/workspaces/:workspaceId/forms',
    requireAuth,
    requireWorkspaceRole('VIEWER'),
    async (req, res) => {
      const query = listFormsQuerySchema.parse(req.query);
      const body: FormListResponse = {
        forms: await forms.list(getMembership(req).workspaceId, query),
      };
      res.json(body);
    },
  );

  router.post(
    '/workspaces/:workspaceId/forms',
    requireAuth,
    requireWorkspaceRole('EDITOR'),
    async (req, res) => {
      const input = createFormInputSchema.parse(req.body ?? {});
      const form: FormDetail = await forms.create(
        getMembership(req).workspaceId,
        getAuth(req).userId,
        input,
      );
      res.status(201).json(form);
    },
  );

  router.get('/forms/:formId', requireAuth, requireFormRole('VIEWER'), async (req, res) => {
    const form: FormDetail = await forms.get(routeParam(req, 'formId'));
    res.json(form);
  });

  router.patch('/forms/:formId', requireAuth, requireFormRole('EDITOR'), async (req, res) => {
    const input = updateFormInputSchema.parse(req.body);
    const formId = routeParam(req, 'formId');
    await checkImages(formId, input);
    const form: FormDetail = await forms.update(formId, input);
    res.json(form);
  });

  router.post(
    '/forms/:formId/duplicate',
    requireAuth,
    requireFormRole('EDITOR'),
    async (req, res) => {
      const form: FormDetail = await forms.duplicate(
        routeParam(req, 'formId'),
        getAuth(req).userId,
      );
      res.status(201).json(form);
    },
  );

  router.delete('/forms/:formId', requireAuth, requireFormRole('EDITOR'), async (req, res) => {
    await forms.remove(routeParam(req, 'formId'));
    res.status(204).end();
  });

  router.post(
    '/forms/:formId/publish',
    requireAuth,
    requireFormRole('EDITOR'),
    async (req, res) => {
      const input = publishFormInputSchema.parse(req.body ?? {});
      const form: FormDetail = await forms.publish(routeParam(req, 'formId'), input);
      res.json(form);
    },
  );

  router.post('/forms/:formId/close', requireAuth, requireFormRole('EDITOR'), async (req, res) => {
    const form: FormDetail = await forms.close(routeParam(req, 'formId'));
    res.json(form);
  });

  router.post('/forms/:formId/reopen', requireAuth, requireFormRole('EDITOR'), async (req, res) => {
    const form: FormDetail = await forms.reopen(routeParam(req, 'formId'));
    res.json(form);
  });

  return router;
}
