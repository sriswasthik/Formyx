import { createApp } from './app.js';
import { EnvError, parseEnv, type Env } from './config/env.js';
import { createEventBus } from './lib/events.js';
import { createLogger } from './lib/logger.js';
import { createPrismaClient } from './lib/prisma.js';

function loadEnv(): Env {
  try {
    return parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvError) {
      process.stderr.write(`Invalid environment configuration:\n${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

const env = loadEnv();
const logger = createLogger(env);
const prisma = createPrismaClient(env.DATABASE_URL, logger);
const app = createApp({ env, logger, prisma, events: createEventBus(logger) });

const server = app.listen(env.PORT, (error) => {
  if (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'Shutting down');
  server.close((error) => {
    if (error) logger.error({ err: error }, 'Error while closing server');
    prisma
      .$disconnect()
      .catch((disconnectError: unknown) => {
        logger.error({ err: disconnectError }, 'Error while disconnecting from the database');
      })
      .finally(() => {
        process.exit(error ? 1 : 0);
      });
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});
