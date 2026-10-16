import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { AppError } from '../lib/app-error.js';
import { routeParam } from '../lib/route-param.js';
import { locationOfFile } from '../lib/upload-storage.js';
import { uploadsUnavailable } from '../services/upload-checks.js';
import type { Guards } from './index.js';

/** How long the download link a member is sent to keeps working. */
export const FILE_LINK_SECONDS = 5 * 60;

/**
 * Respondents' private files, behind their Formyx file links: for members of the form's
 * workspace only, who are sent on to a download link that works for a few minutes. Nothing
 * here is cached, so a link copied from the redirect soon stops working.
 */
export function createFilesRouter(
  { env, storage }: AppDependencies,
  { requireAuth, requireFormRole }: Guards,
): Router {
  const router = Router();

  router.get(
    '/forms/:formId/files/:resourceType/:file',
    requireAuth,
    requireFormRole('VIEWER'),
    (req, res) => {
      const formId = routeParam(req, 'formId');
      const found = locationOfFile(
        formId,
        routeParam(req, 'resourceType'),
        routeParam(req, 'file'),
      );
      // Only the form's own respondents' files, wherever the link claims to point.
      if (!found?.location.publicId.startsWith(`${env.CLOUDINARY_FOLDER}/forms/${formId}/`)) {
        throw new AppError(404, 'NOT_FOUND', 'File not found');
      }
      if (!storage) throw uploadsUnavailable();
      res.set('Cache-Control', 'no-store');
      res.set('Referrer-Policy', 'no-referrer');
      res.redirect(302, storage.downloadUrl(found.location, FILE_LINK_SECONDS));
    },
  );

  return router;
}
