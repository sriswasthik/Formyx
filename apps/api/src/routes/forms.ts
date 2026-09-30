import {
  createFormInputSchema,
  listFormsQuerySchema,
  publishFormInputSchema,
  updateFormInputSchema,
  type FormDetail,
  type FormListResponse,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { routeParam } from '../lib/route-param.js';
import { getAuth, getMembership, type AuthGuards } from '../middleware/auth.js';
import { createFormService } from '../services/form-service.js';

/**
 * Anyone in the workspace can read its forms; changing them takes EDITOR or above.
 * Routes are declared with full paths because they span two resources.
 */
export function createFormsRouter(
  { prisma }: AppDependencies,
  { requireAuth, requireWorkspaceRole, requireFormRole }: AuthGuards,
): Router {
  const router = Router();
  const forms = createFormService(prisma);

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
    const form: FormDetail = await forms.update(routeParam(req, 'formId'), input);
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
