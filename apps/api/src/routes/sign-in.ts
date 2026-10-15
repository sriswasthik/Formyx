import {
  SIGN_IN_ERROR_PARAM,
  SIGN_IN_PROVIDER_PARAM,
  signInProviderSchema,
  signInStartQuerySchema,
  type SignInError,
  type SignInProvider,
  type SignInProvidersResponse,
} from '@formyx/shared';
import { Router, type Request, type Response } from 'express';
import type { AppDependencies } from '../app.js';
import { reportError } from '../lib/monitoring.js';
import { createPasswordHasher } from '../lib/password.js';
import { routeParam } from '../lib/route-param.js';
import { createOAuthCallbackRateLimiter } from '../middleware/rate-limit.js';
import { createAuthService } from '../services/auth-service.js';
import { beginSignIn, finishSignIn, readFlowPage } from '../sign-in/flow.js';
import {
  exchangeSignInCode,
  signInAuthorizeUrl,
  signInConfigured,
  SignInFlowError,
} from '../sign-in/providers.js';
import { announceNewAccount, setSessionFor } from './auth.js';

/**
 * "Continue with Google" and "Continue with Zoho". Both ends are page loads: starting sends
 * the browser to the provider, and the callback signs them in (making the account the first
 * time, which sends the welcome email) and sends them on into the app. Anything that goes
 * wrong lands back on the page they started from, with `?sign_in_error=<code>`.
 */
export function createSignInRouter(deps: AppDependencies): Router {
  const { env, prisma, logger } = deps;
  const router = Router();
  const auth = createAuthService({
    prisma,
    passwords: createPasswordHasher(env.BCRYPT_COST),
    mode: env.ENTITLEMENTS_MODE,
  });
  const limit = createOAuthCallbackRateLimiter();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/providers', (_req, res) => {
    const body: SignInProvidersResponse = {
      providers: signInProviderSchema.options.filter((provider) => signInConfigured(env, provider)),
    };
    res.json(body);
  });

  function sendBack(
    res: Response,
    page: 'login' | 'signup',
    error: SignInError,
    provider: SignInProvider,
  ) {
    const params = new URLSearchParams({
      [SIGN_IN_ERROR_PARAM]: error,
      [SIGN_IN_PROVIDER_PARAM]: provider,
    });
    res.redirect(303, `${env.APP_URL}/${page}?${params.toString()}`);
  }

  const providerOf = (req: Request) => signInProviderSchema.safeParse(routeParam(req, 'provider'));

  router.get('/oauth/:provider', limit, (req, res) => {
    const provider = providerOf(req);
    const page = req.query.page === 'signup' ? 'signup' : 'login';
    if (!provider.success) {
      res.redirect(303, `${env.APP_URL}/${page}`);
      return;
    }
    if (!signInConfigured(env, provider.data)) {
      sendBack(res, page, 'unavailable', provider.data);
      return;
    }
    const query = signInStartQuerySchema.parse(req.query);
    const { state, codeChallenge } = beginSignIn(res, env, {
      provider: provider.data,
      page,
      ...(query.next && { next: query.next }),
      ...(query.ref && { ref: query.ref }),
      ...(query.source && { source: query.source }),
    });
    res.redirect(303, signInAuthorizeUrl(env, provider.data, { state, codeChallenge }));
  });

  router.get('/oauth/:provider/callback', limit, async (req, res) => {
    const provider = providerOf(req);
    if (!provider.success) {
      res.redirect(303, `${env.APP_URL}/login`);
      return;
    }
    const query = (name: string) => {
      const value = req.query[name];
      return typeof value === 'string' && value !== '' ? value : undefined;
    };
    const state = query('state');
    const started = finishSignIn(req, res, env, { provider: provider.data, state });
    if (!started) {
      sendBack(res, readFlowPage(state), 'expired', provider.data);
      return;
    }
    const { flow, codeVerifier } = started;
    const providerError = query('error');
    const code = query('code');
    if (providerError || !code) {
      sendBack(
        res,
        flow.page,
        providerError === 'access_denied' ? 'cancelled' : 'failed',
        flow.provider,
      );
      return;
    }

    // Zoho names the data centre the person's account lives in.
    const accountsServer = query('accounts-server');
    try {
      const profile = await exchangeSignInCode(env, flow.provider, {
        code,
        codeVerifier,
        ...(accountsServer && { accountsServer }),
      });
      const { me, created } = await auth.signInWithProvider(profile, {
        ...(flow.ref && { referralCode: flow.ref }),
        ...(flow.source && { source: flow.source }),
      });
      await setSessionFor(deps, res, me.user.id);
      if (created) announceNewAccount(deps, me);
      res.redirect(303, `${env.APP_URL}${flow.next ?? '/app'}`);
    } catch (error) {
      // A page load: whatever went wrong, they land back on a page that says so.
      if (error instanceof SignInFlowError) {
        logger.warn({ provider: flow.provider, reason: error.message }, 'Sign-in did not finish');
      } else {
        logger.error({ err: error, provider: flow.provider }, 'Sign-in failed');
        reportError(error, { provider: flow.provider });
      }
      sendBack(
        res,
        flow.page,
        error instanceof SignInFlowError ? error.code : 'failed',
        flow.provider,
      );
    }
  });

  return router;
}
