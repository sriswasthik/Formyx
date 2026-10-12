import {
  autoresponderTestInputSchema,
  changeSlugInputSchema,
  chatTestInputSchema,
  chatWebhookInputSchema,
  formPasswordInputSchema,
  updateFormSettingsInputSchema,
  type FormSettingsView,
  type UpdateFormSettingsInput,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { demoRestricted, isDemoUser } from '../demo/restrictions.js';
import { createPasswordHasher } from '../lib/password.js';
import { routeParam } from '../lib/route-param.js';
import { encryptionFromEnv } from '../lib/encryption.js';
import { getAuth } from '../middleware/auth.js';
import { createEntitlementService } from '../services/entitlement-service.js';
import { createFormSettingsService } from '../services/form-settings-service.js';
import type { Guards } from './index.js';

/** Whether `update` turns on something that emails or posts outside Formyx. */
function reachesOutside(update: UpdateFormSettingsInput): boolean {
  return (
    update.autoresponder?.enabled === true ||
    (update.notifications?.emails.length ?? 0) > 0 ||
    update.access?.oneResponsePer === 'email'
  );
}

/**
 * A form's live settings: members may read them; editors change them. Anything that would
 * email or post outside Formyx is refused for the shared demo account.
 */
export function createFormSettingsRouter(
  { env, prisma, mailer, chat }: AppDependencies,
  { requireAuth, requireRealAccount, requireFormRole }: Guards,
): Router {
  const router = Router();
  const settings = createFormSettingsService({
    prisma,
    entitlements: createEntitlementService(prisma, env.ENTITLEMENTS_MODE),
    passwords: createPasswordHasher(env.BCRYPT_COST),
    secrets: encryptionFromEnv(env),
    chat,
    mailer,
  });
  const editors = [requireAuth, requireFormRole('EDITOR')];
  const realEditors = [requireAuth, requireRealAccount, requireFormRole('EDITOR')];

  router.get(
    '/forms/:formId/settings',
    requireAuth,
    requireFormRole('VIEWER'),
    async (req, res) => {
      const body: FormSettingsView = await settings.get(routeParam(req, 'formId'));
      res.json(body);
    },
  );

  router.patch('/forms/:formId/settings', ...editors, async (req, res) => {
    const input = updateFormSettingsInputSchema.parse(req.body);
    if (reachesOutside(input) && (await isDemoUser(prisma, getAuth(req).userId))) {
      throw demoRestricted('Emails to other people are switched off for the demo account.');
    }
    const body: FormSettingsView = await settings.update(routeParam(req, 'formId'), input);
    res.json(body);
  });

  // The password comes in the body, so it never appears in request logs.
  router.put('/forms/:formId/settings/password', ...editors, async (req, res) => {
    const { password } = formPasswordInputSchema.parse(req.body);
    const body: FormSettingsView = await settings.setPassword(routeParam(req, 'formId'), password);
    res.json(body);
  });

  router.put('/forms/:formId/settings/chat', ...realEditors, async (req, res) => {
    const { service, url } = chatWebhookInputSchema.parse(req.body);
    const body: FormSettingsView = await settings.setChatWebhook(
      routeParam(req, 'formId'),
      service,
      url,
    );
    res.json(body);
  });

  router.post('/forms/:formId/settings/chat/test', ...realEditors, async (req, res) => {
    const { service } = chatTestInputSchema.parse(req.body);
    await settings.testChat(routeParam(req, 'formId'), service);
    res.status(204).end();
  });

  router.put('/forms/:formId/slug', ...editors, async (req, res) => {
    const { slug } = changeSlugInputSchema.parse(req.body);
    const body: FormSettingsView = await settings.changeSlug(routeParam(req, 'formId'), slug);
    res.json(body);
  });

  // Sent to whoever asks, so it can never email anyone else.
  router.post('/forms/:formId/settings/autoresponder/test', ...realEditors, async (req, res) => {
    const { autoresponder } = autoresponderTestInputSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: getAuth(req).userId },
      select: { email: true },
    });
    if (!user) throw new Error('A signed-in user has no account');
    await settings.sendAutoresponderTest(routeParam(req, 'formId'), autoresponder, user.email);
    res.status(202).end();
  });

  return router;
}
