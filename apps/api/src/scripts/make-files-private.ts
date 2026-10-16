// Makes respondents' files uploaded before Sprint 21 private (see private-files.ts):
// `pnpm --filter @formyx/api db:make-files-private -- --dry-run` (or files:make-private on a
// built server) to see how many, then without.
// It uses DATABASE_URL and the Cloudinary account, so check which ones those are first.
import { envSchema } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { createPrismaClient } from '../lib/prisma.js';
import { createUploadStorage } from '../lib/upload-storage.js';
import { makeAnswerFilesPrivate } from './private-files.js';

const env = envSchema
  .pick({
    DATABASE_URL: true,
    NODE_ENV: true,
    LOG_LEVEL: true,
    APP_URL: true,
    CLOUDINARY_CLOUD_NAME: true,
    CLOUDINARY_API_KEY: true,
    CLOUDINARY_API_SECRET: true,
    CLOUDINARY_API_URL: true,
    CLOUDINARY_FOLDER: true,
  })
  .parse(process.env);
const logger = createLogger(env);
const prisma = createPrismaClient(env.DATABASE_URL, logger);
const storage = createUploadStorage(env);
const dryRun = process.argv.includes('--dry-run');

try {
  if (!storage) throw new Error('Cloudinary is not configured');
  const report = await makeAnswerFilesPrivate(prisma, storage, {
    root: env.CLOUDINARY_FOLDER,
    appUrl: env.APP_URL,
    dryRun,
  });
  logger.info(
    { dryRun, ...report },
    dryRun ? 'Files that would be made private' : 'Files made private',
  );
} catch (error) {
  logger.fatal({ err: error }, 'Could not make files private');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
