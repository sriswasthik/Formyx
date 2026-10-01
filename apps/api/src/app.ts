import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import type { EventBus } from './lib/events.js';
import type { Database } from './lib/prisma.js';
import type { UploadStorage } from './lib/upload-storage.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { requestLogger } from './middleware/request-logger.js';
import { createApiRouter } from './routes/index.js';

export interface AppDependencies {
  env: Env;
  logger: Logger;
  prisma: Database;
  /** Where routes announce what happened, e.g. a saved response. */
  events: EventBus;
  /** File storage; `null` when uploads are not set up. */
  storage: UploadStorage | null;
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
  app.use((req, res, next) => {
    const parse = req.path.startsWith('/api/forms/')
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
