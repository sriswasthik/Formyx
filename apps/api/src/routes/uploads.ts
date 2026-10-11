import {
  BYTES_PER_MB,
  uploadRules,
  THEME_IMAGE_FORMATS,
  THEME_IMAGE_MAX_MB,
  uploadSignatureQuerySchema,
  type UploadSignature,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { demoRestricted, isDemoForm, isDemoUser } from '../demo/restrictions.js';
import { AppError } from '../lib/app-error.js';
import { answerFolder, themeFolder } from '../lib/upload-storage.js';
import { assertRole, findFormAccess, getAuth, type AuthGuards } from '../middleware/auth.js';
import { createUploadRateLimiter } from '../middleware/rate-limit.js';
import { createPublicFormService } from '../services/public-form-service.js';
import { createUploadChecks, uploadsUnavailable } from '../services/upload-checks.js';

/**
 * Signs uploads that go straight from the browser to storage. Respondents' files, signatures
 * and voice notes need no account but the form must be taking responses; a form's own images
 * (logo, cover, background, pictures in the form) take EDITOR access.
 */
export function createUploadsRouter(
  { env, prisma, storage }: AppDependencies,
  { requireAuth }: AuthGuards,
): Router {
  const router = Router();
  const root = env.CLOUDINARY_FOLDER;
  const forms = createPublicFormService(prisma, createUploadChecks({ storage, root }));
  const limit = createUploadRateLimiter();

  router.get(
    '/signature',
    (req, res, next) => {
      // Respondents are anonymous and rate limited; everything else needs a session.
      if (req.query.purpose === 'answer') {
        limit(req, res, next);
      } else {
        requireAuth(req, res, next);
      }
    },
    async (req, res) => {
      const query = uploadSignatureQuerySchema.parse(req.query);
      if (!storage) throw uploadsUnavailable();

      let body: UploadSignature;
      if (query.purpose === 'answer') {
        const form = await forms.openForm(query.form);
        if (await isDemoForm(prisma, form.id)) {
          throw demoRestricted('File uploads are switched off on demo forms.');
        }
        const field = form.schema.fields.find((candidate) => candidate.id === query.field);
        const rules = field && uploadRules(field);
        if (!field || !rules) {
          throw new AppError(404, 'NOT_FOUND', 'This question does not take files');
        }
        body = storage.signUpload({
          folder: answerFolder(root, form.id, field.id),
          allowedFormats: rules.extensions,
          maxBytes: rules.maxSizeMb * BYTES_PER_MB,
        });
      } else {
        const { userId } = getAuth(req);
        const access = await findFormAccess(prisma, query.formId, userId);
        if (!access) throw new AppError(404, 'NOT_FOUND', 'Form not found');
        assertRole(access.role, 'EDITOR');
        if (await isDemoUser(prisma, userId)) throw demoRestricted();
        body = storage.signUpload({
          folder: themeFolder(root, query.formId),
          allowedFormats: THEME_IMAGE_FORMATS,
          maxBytes: THEME_IMAGE_MAX_MB * BYTES_PER_MB,
        });
      }

      res.set('Cache-Control', 'no-store');
      res.json(body);
    },
  );

  return router;
}
