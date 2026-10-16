import { randomUUID } from 'node:crypto';
import {
  editLoadInputSchema,
  FORM_ACCESS_HEADER,
  HONEYPOT_FIELD,
  progressInputSchema,
  reportFormInputSchema,
  resumeDraftInputSchema,
  saveDraftInputSchema,
  submissionInputSchema,
  unlockInputSchema,
  verificationCheckInputSchema,
  verificationStartInputSchema,
  type AccessTokenResponse,
  type DraftResponse,
  type EditLoadResponse,
  type FormMeta,
  type PublicFormResponse,
  type SubmissionResponse,
  type ViewResponse,
} from '@formyx/shared';
import { Router, type Request } from 'express';
import type { AppDependencies } from '../app.js';
import { createPasswordHasher } from '../lib/password.js';
import { routeParam } from '../lib/route-param.js';
import { createPublicRateLimiters } from '../middleware/rate-limit.js';
import { createDraftService } from '../services/draft-service.js';
import { createFormMetaService } from '../services/form-meta.js';
import { createPublicFormService } from '../services/public-form-service.js';
import { createUploadChecks } from '../services/upload-checks.js';
import { createReportService } from '../trust/report-service.js';
import { createTurnstileVerifier, turnstileKeys } from '../trust/turnstile.js';

/** The token from unlocking a password-protected form, if the browser sent one. */
export function accessTokenOf(req: Request): string | undefined {
  const token = req.get(FORM_ACCESS_HEADER)?.trim();
  return token ? token.slice(0, 2000) : undefined;
}

/**
 * Published forms, for anyone with the link: no account needed. Only the published snapshot
 * is ever sent, never the draft, and only once the form's access settings allow it.
 */
export function createPublicFormsRouter({
  env,
  logger,
  prisma,
  events,
  storage,
  mailer,
}: AppDependencies): Router {
  const router = Router();
  const captchaKeys = turnstileKeys(env);
  const forms = createPublicFormService({
    prisma,
    uploads: createUploadChecks({ storage, root: env.CLOUDINARY_FOLDER, appUrl: env.APP_URL }),
    secret: env.JWT_SECRET,
    passwords: createPasswordHasher(env.BCRYPT_COST),
    mailer,
    appUrl: env.APP_URL,
    entitlementsMode: env.ENTITLEMENTS_MODE,
    enforcementMode: env.ENFORCEMENT_MODE,
    newAccountLimits: env.NEW_ACCOUNT_LIMITS,
    captcha: captchaKeys && {
      siteKey: captchaKeys.siteKey,
      verifier: createTurnstileVerifier({ keys: captchaKeys, baseUrl: env.TURNSTILE_URL, logger }),
    },
  });
  const drafts = createDraftService({
    prisma,
    mailer,
    appUrl: env.APP_URL,
    openForm: (slug, accessToken) => forms.openForm(slug, accessToken),
  });
  const limit = createPublicRateLimiters(env);
  const meta = createFormMetaService(prisma, env.APP_URL, env.ENTITLEMENTS_MODE);
  const reports = createReportService({ prisma, secret: env.JWT_SECRET });

  // Closing a form must take effect at once, so nothing may cache these responses.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Link previews: read by the site's edge function and by chat apps fetching the image.
  router.get('/:slug/meta', limit.meta, async (req, res) => {
    const body: FormMeta = await meta.meta(routeParam(req, 'slug'));
    res.set('Cache-Control', 'public, max-age=60');
    res.json(body);
  });

  router.get('/:slug/og.png', limit.previewImage, async (req, res) => {
    const image = await meta.image(routeParam(req, 'slug'));
    if ('redirect' in image) {
      res.redirect(302, image.redirect);
      return;
    }
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
    res.send(image.png);
  });

  router.get('/:slug', limit.load, async (req, res) => {
    const form: PublicFormResponse = await forms.get(routeParam(req, 'slug'), accessTokenOf(req));
    res.json(form);
  });

  // The password comes in the body, so it never appears in request logs.
  router.post('/:slug/unlock', limit.unlock, async (req, res) => {
    const { password } = unlockInputSchema.parse(req.body);
    const body: AccessTokenResponse = await forms.unlock(routeParam(req, 'slug'), password);
    res.json(body);
  });

  router.post('/:slug/verify', limit.sendCode, async (req, res) => {
    const { email } = verificationStartInputSchema.parse(req.body);
    await forms.startVerification(routeParam(req, 'slug'), email, accessTokenOf(req));
    res.status(202).end();
  });

  router.post('/:slug/verify/check', limit.checkCode, async (req, res) => {
    const input = verificationCheckInputSchema.parse(req.body);
    const body: AccessTokenResponse = await forms.checkVerification(
      routeParam(req, 'slug'),
      input,
      accessTokenOf(req),
    );
    res.json(body);
  });

  router.post('/:slug/view', limit.view, async (req, res) => {
    const body: ViewResponse = await forms.recordView(routeParam(req, 'slug'), accessTokenOf(req));
    res.status(201).json(body);
  });

  // Anonymous and best effort: the reply never says whether anything was recorded.
  router.post('/:slug/progress', limit.progress, async (req, res) => {
    await forms.recordProgress(routeParam(req, 'slug'), progressInputSchema.parse(req.body));
    res.status(204).end();
  });

  router.post('/:slug/drafts', limit.saveDraft, async (req, res) => {
    await drafts.save(
      routeParam(req, 'slug'),
      saveDraftInputSchema.parse(req.body),
      accessTokenOf(req),
    );
    res.status(202).end();
  });

  // Tokens come in the body, so they never appear in request logs.
  router.post('/:slug/drafts/resume', limit.resumeDraft, async (req, res) => {
    const { token } = resumeDraftInputSchema.parse(req.body);
    const body: DraftResponse = await drafts.resume(
      routeParam(req, 'slug'),
      token,
      accessTokenOf(req),
    );
    res.json(body);
  });

  router.post('/:slug/edit', limit.loadEdit, async (req, res) => {
    const { token } = editLoadInputSchema.parse(req.body);
    const body: EditLoadResponse = await forms.loadEdit(
      routeParam(req, 'slug'),
      token,
      accessTokenOf(req),
    );
    res.json(body);
  });

  // "Report this form": anyone, no account; see trust/report-service.ts.
  router.post('/:slug/report', limit.report, async (req, res) => {
    await reports.report(
      routeParam(req, 'slug'),
      reportFormInputSchema.parse(req.body),
      req.ip ?? '',
    );
    res.status(204).end();
  });

  router.post('/:slug/submissions', limit.submit, limit.submitToForm, async (req, res) => {
    const input = submissionInputSchema.parse(req.body);

    // People never see the honeypot. Whoever filled it in gets the usual reply, so bots
    // cannot tell they were caught, but nothing is stored.
    if (input[HONEYPOT_FIELD]?.trim()) {
      logger.info({ slug: routeParam(req, 'slug') }, 'Ignored a submission caught by the honeypot');
      const outcome = await forms.previewOutcome(
        routeParam(req, 'slug'),
        input.answers,
        accessTokenOf(req),
      );
      const body: SubmissionResponse = { id: randomUUID(), outcome };
      res.status(201).json(body);
      return;
    }

    const saved = await forms.submit(routeParam(req, 'slug'), input, {
      userAgent: req.get('user-agent'),
      accessToken: accessTokenOf(req),
      ip: req.ip,
    });
    const body: SubmissionResponse = {
      id: saved.submission.id,
      outcome: saved.outcome,
      ...(saved.editToken && { editToken: saved.editToken }),
    };
    // A retry of a response already stored: the same reply, and nothing announced again.
    if (saved.replayed) {
      res.status(200).json(body);
      return;
    }
    res.status(saved.edited ? 200 : 201).json(body);
    // Committed and answered: now live dashboards and notification emails can follow.
    events.emit(saved.edited ? 'submission.updated' : 'submission.created', saved);
  });

  return router;
}
