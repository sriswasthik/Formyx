import { EnvError, parseEnv, type Env } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createMailer } from './lib/mailer.js';
import { createPrismaClient } from './lib/prisma.js';
import { createServer } from './server.js';

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
if (env.NODE_ENV === 'production' && !env.RESEND_API_KEY) {
  logger.warn('RESEND_API_KEY is not set: notification emails will be logged, not sent');
}
const server = createServer({ env, logger, prisma, mailer: createMailer(env, logger) });

server.httpServer.once('error', (error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
server.httpServer.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'Shutting down');
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();

  let exitCode = 0;
  try {
    await server.close();
  } catch (error) {
    logger.error({ err: error }, 'Error while closing server');
    exitCode = 1;
  }
  try {
    await prisma.$disconnect();
  } catch (error) {
    logger.error({ err: error }, 'Error while disconnecting from the database');
  }
  process.exit(exitCode);
}

const onSignal = (signal: NodeJS.Signals) => {
  void shutdown(signal);
};
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});
