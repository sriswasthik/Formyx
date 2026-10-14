import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import type { JobQueue } from './jobs/queue.js';
import type { EventBus } from './lib/events.js';
import type { Mailer } from './lib/mailer.js';
import type { Database } from './lib/prisma.js';
import type { ProductAnalytics } from './lib/product-analytics.js';
import type { UploadStorage } from './lib/upload-storage.js';
import type { WebhookTransport } from './lib/webhook-transport.js';
import type { WebhookDispatcher } from './webhooks/dispatcher.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { requestLogger } from './middleware/request-logger.js';
import { createApiRouter } from './routes/index.js';
import { RAZORPAY_WEBHOOK_PATH } from './routes/razorpay-webhook.js';

export interface AppDependencies {
  env: Env;
  logger: Logger;
  prisma: Database;
  /** Where routes announce what happened, e.g. a saved response. */
  events: EventBus;
  /** File storage; `null` when uploads are not set up. */
  storage: UploadStorage | null;
  /** Sends emails a request asks for, such as invites. */
  mailer: Mailer;
  /** Delivers webhook events; routes use it for test events. */
  webhooks: WebhookDispatcher;
  /** Background jobs; routes send some (retrying a failed job, copying responses to a sheet). */
  jobs: JobQueue;
  /** Posts to Slack and Discord incoming webhooks (new responses, test messages). */
  chat: WebhookTransport;
  /** Product events (a form published, a premium font used), when PostHog is set up. */
  analytics: ProductAnalytics;
}

export function createApp(deps: AppDependencies): Express {
  const { env, logger } = deps;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  // Form updates carry whole schemas and responses can hold long answers; the rest is small.
  const parseJson = express.json({ limit: '100kb' });
  const parseFormJson = express.json({ limit: '1mb' });
  const parseSubmissionJson = express.json({ limit: '256kb' });
  // Razorpay signs a webhook's exact bytes, so its body stays raw until the signature is checked.
  const parseRaw = express.raw({ type: '*/*', limit: '1mb' });
  app.use((req, res, next) => {
    const parse =
      req.path === RAZORPAY_WEBHOOK_PATH
        ? parseRaw
        : req.path.startsWith('/api/forms/')
          ? parseFormJson
          : req.path.startsWith('/api/public/forms/')
            ? parseSubmissionJson
            : parseJson;
    parse(req, res, next);
  });
  app.use(cookieParser());

  app.use('/api', createApiRouter(deps));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
