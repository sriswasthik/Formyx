/* eslint-disable no-console -- a command-line tool: printing is how it reports. */
// Makes an account a Formyx admin, who may open /admin:
// `pnpm --filter @formyx/api admin:grant someone@example.com`; `--revoke` takes it away.
// It uses DATABASE_URL, so check which database that is before running it.
import { normalizeEmail } from '@formyx/shared';
import { envSchema } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { createPrismaClient } from '../lib/prisma.js';

const env = envSchema
  .pick({ DATABASE_URL: true, NODE_ENV: true, LOG_LEVEL: true })
  .parse(process.env);
const email = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const revoke = process.argv.includes('--revoke');
if (!email) {
  console.error('Usage: admin:grant <email> [--revoke]');
  process.exit(1);
}

const prisma = createPrismaClient(env.DATABASE_URL, createLogger(env));
try {
  const { count } = await prisma.user.updateMany({
    where: { email: normalizeEmail(email), isDemo: false },
    data: { isAdmin: !revoke },
  });
  if (count === 0) {
    console.error(`No account for ${email}.`);
    process.exitCode = 1;
  } else {
    console.log(revoke ? `${email} is no longer an admin.` : `${email} is now an admin.`);
  }
} finally {
  await prisma.$disconnect();
}
