import {
  CONNECT_ERROR_PARAM,
  CONNECT_RESULT_PARAM,
  integrationKindSchema,
  updateIntegrationInputSchema,
  type ConnectIntegrationResponse,
  type IntegrationKind,
  type IntegrationsOverview,
  type IntegrationView,
} from '@formyx/shared';
import { Router, type Request, type RequestHandler } from 'express';
import type { AppDependencies } from '../app.js';
import { encryptionFromEnv } from '../lib/encryption.js';
import { routeParam } from '../lib/route-param.js';
import { readSessionToken, verifySession } from '../lib/session.js';
import { getAuth } from '../middleware/auth.js';
import { createEntitlementService } from '../services/entitlement-service.js';
import { createFormSettingsService } from '../services/form-settings-service.js';
import { createPasswordHasher } from '../lib/password.js';
import { INTEGRATION_FEATURE, createIntegrationService } from '../services/integration-service.js';
import type { Guards } from './index.js';

/**
 * A form's integrations: the overview and failed jobs for editors, connecting through
 * Google's or Notion's sign-in (whose callbacks come back here as page loads, so they
 * redirect rather than answer JSON), pausing, re-syncing and disconnecting.
 */
export function createIntegrationsRouter(
  { env, prisma, jobs, logger, mailer, chat }: AppDependencies,
  { requireAuth, requireRealAccount, requireFormRole, requireFeature }: Guards,
): Router {
  const router = Router();
  const encryption = encryptionFromEnv(env);
  const entitlements = createEntitlementService(prisma, env.ENTITLEMENTS_MODE);
  const integrations = createIntegrationService({
    prisma,
    env,
    encryption,
    jobs,
    entitlements,
    logger,
  });
  const settings = createFormSettingsService({
    prisma,
    entitlements,
    passwords: createPasswordHasher(env.BCRYPT_COST),
    secrets: encryption,
    chat,
    mailer,
  });
  const editors = [requireAuth, requireFormRole('EDITOR')];
  const realEditors = [requireAuth, requireRealAccount, requireFormRole('EDITOR')];

  router.get('/forms/:formId/integrations', ...editors, async (req, res) => {
    const formId = routeParam(req, 'formId');
    const { chat: channels } = await settings.get(formId);
    const body: IntegrationsOverview = await integrations.overview(formId, channels);
    res.json(body);
  });

  /** The plan check for the `:kind` being connected. */
  const requireKindFeature: RequestHandler = (req, res, next) => {
    const kind = integrationKindSchema.parse(routeParam(req, 'kind'));
    // Returned, so Express passes a refusal to the error handler.
    return requireFeature(INTEGRATION_FEATURE[kind])(req, res, next);
  };

  router.post(
    '/forms/:formId/integrations/:kind/connect',
    ...realEditors,
    requireKindFeature,
    (req, res) => {
      const kind = integrationKindSchema.parse(routeParam(req, 'kind'));
      const body: ConnectIntegrationResponse = {
        authorizeUrl: integrations.authorizeUrl(
          routeParam(req, 'formId'),
          getAuth(req).userId,
          kind,
        ),
      };
      res.json(body);
    },
  );

  /** The signed-in person, if any, without refusing anyone (callbacks are page loads). */
  async function sessionUserId(req: Request): Promise<string | null> {
    const token = readSessionToken(req);
    const session = token ? verifySession(token, env.JWT_SECRET) : null;
    if (!session) return null;
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordVersion: true },
    });
    return user?.passwordVersion === session.passwordVersion ? session.userId : null;
  }

  const callback =
    (kind: IntegrationKind): RequestHandler =>
    async (req, res) => {
      const query = (name: string) => {
        const value = req.query[name];
        return typeof value === 'string' ? value : undefined;
      };
      const userId = await sessionUserId(req);
      if (!userId) {
        res.redirect(303, `${env.APP_URL}/login`);
        return;
      }
      const { formId, error } = await integrations.complete(
        kind,
        { code: query('code'), state: query('state'), error: query('error') },
        userId,
      );
      const page = formId
        ? `${env.APP_URL}/app/forms/${encodeURIComponent(formId)}/integrations`
        : `${env.APP_URL}/app/forms`;
      const params = new URLSearchParams(
        error ? { [CONNECT_ERROR_PARAM]: error } : { [CONNECT_RESULT_PARAM]: kind },
      );
      res.redirect(303, `${page}?${params.toString()}`);
    };
  router.get('/integrations/google/callback', callback('google_sheets'));
  router.get('/integrations/notion/callback', callback('notion'));

  router.patch('/forms/:formId/integrations/:integrationId', ...realEditors, async (req, res) => {
    const { paused } = updateIntegrationInputSchema.parse(req.body);
    const body: IntegrationView = await integrations.setPaused(
      routeParam(req, 'formId'),
      routeParam(req, 'integrationId'),
      paused,
    );
    res.json(body);
  });

  router.post(
    '/forms/:formId/integrations/:integrationId/resync',
    ...realEditors,
    async (req, res) => {
      await integrations.resync(routeParam(req, 'formId'), routeParam(req, 'integrationId'));
      res.status(202).end();
    },
  );

  router.delete('/forms/:formId/integrations/:integrationId', ...editors, async (req, res) => {
    await integrations.disconnect(routeParam(req, 'formId'), routeParam(req, 'integrationId'));
    res.status(204).end();
  });

  router.post('/forms/:formId/job-failures/:failureId/retry', ...editors, async (req, res) => {
    await integrations.failures.retry(routeParam(req, 'formId'), routeParam(req, 'failureId'));
    res.status(202).end();
  });

  router.delete('/forms/:formId/job-failures/:failureId', ...editors, async (req, res) => {
    await integrations.failures.dismiss(routeParam(req, 'formId'), routeParam(req, 'failureId'));
    res.status(204).end();
  });

  return router;
}
