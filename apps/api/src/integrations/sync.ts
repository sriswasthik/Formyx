import { readLiveSettings, type SheetSources } from '@formyx/shared';
import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { IntegrationStatus } from '../generated/prisma/client.js';
import type { SubmissionChange } from '../jobs/job-types.js';
import { PermanentJobError, type JobContext, type JobQueue } from '../jobs/queue.js';
import type { Encryption } from '../lib/encryption.js';
import type { EventBus, SubmissionEvent } from '../lib/events.js';
import type { Database } from '../lib/prisma.js';
import { parsePublishedSchema } from '../services/form-service.js';
import { formAllows } from '../services/entitlement-service.js';
import { storedIntegrationFeature } from '../services/integration-service.js';
import { createSubmissionService } from '../services/submission-service.js';
import { CredentialsError, googleAccess } from './credentials.js';
import { IntegrationApiError, IntegrationAuthError } from './errors.js';
import { createSheetsClient, GoogleApiError } from './google.js';
import { notionSync } from './notion-sync.js';
import { catchUpSheet, isSheetMissing, prepareSheet, writeResponse } from './sheets-sync.js';

/*
 * Copying responses to integrations as jobs: a backfill when one is connected (and to catch
 * up after a pause or a reconnect), then one job per new or changed response. Each
 * integration runs one job at a time in this process, so a new sheet is never made twice.
 *
 * Status follows what happens: active after a successful write; error (with the last error)
 * while writes keep failing; needs_reconnect when the account's access ended, which no retry
 * can fix.
 */

/** Statuses that take new responses as they arrive. Paused and disconnected ones catch up later. */
const SYNCING: IntegrationStatus[] = ['CONNECTING', 'ACTIVE', 'ERROR'];
const ERROR_MAX_LENGTH = 500;

export interface IntegrationSyncDependencies {
  env: Env;
  logger: Logger;
  prisma: Database;
  events: EventBus;
  jobs: JobQueue;
  encryption: Encryption;
}

/** One job at a time per integration, in this process. */
function createLocks() {
  const tails = new Map<string, Promise<void>>();
  return async <T>(key: string, run: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => tail);
    tails.set(key, chained);
    await previous;
    try {
      return await run();
    } finally {
      release();
      if (tails.get(key) === chained) tails.delete(key);
    }
  };
}

const message = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, ERROR_MAX_LENGTH);

export function registerIntegrationJobs(deps: IntegrationSyncDependencies): () => void {
  const { env, logger, prisma, events, jobs, encryption } = deps;
  const submissions = createSubmissionService(prisma);
  const lock = createLocks();

  async function load(integrationId: string) {
    return prisma.integration.findUnique({
      where: { id: integrationId },
      select: {
        id: true,
        formId: true,
        kind: true,
        status: true,
        config: true,
        credentialsEncrypted: true,
        form: {
          select: {
            title: true,
            publishedTitle: true,
            publishedSchema: true,
            liveSettings: true,
          },
        },
      },
    });
  }
  type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

  function formOf(integration: Loaded) {
    const { access } = readLiveSettings(integration.form.liveSettings);
    const sources: SheetSources = {
      collectsEmail: access.requireEmail || access.oneResponsePer === 'email',
      allowsEdits: access.allowEdits,
    };
    return {
      id: integration.formId,
      title: integration.form.publishedTitle ?? integration.form.title,
      schema: parsePublishedSchema(integration.form.publishedSchema),
      sources,
    };
  }

  async function markSynced(integrationId: string) {
    await prisma.integration.updateMany({
      // A pause or disconnect while the job ran wins.
      where: { id: integrationId, status: { in: SYNCING } },
      data: { status: 'ACTIVE', lastSyncedAt: new Date(), lastError: null, lastErrorAt: null },
    });
  }

  /**
   * Records what went wrong and decides whether to retry: lost access needs a reconnect (no
   * retry); a refused request is an error people must fix (no retry); anything else is
   * retried, the integration showing "error" once the last try fails.
   */
  async function fail(integrationId: string, error: unknown, context: JobContext): Promise<never> {
    const lostAccess = error instanceof IntegrationAuthError || error instanceof CredentialsError;
    const refused = error instanceof IntegrationApiError && !error.retryable;
    const status: IntegrationStatus | null = lostAccess
      ? 'NEEDS_RECONNECT'
      : refused || context.lastAttempt
        ? 'ERROR'
        : null;
    await prisma.integration.updateMany({
      where: { id: integrationId, status: { not: 'PAUSED' } },
      data: {
        lastError: message(error),
        lastErrorAt: new Date(),
        ...(status && { status }),
      },
    });
    if (lostAccess || refused) throw new PermanentJobError(message(error));
    throw error;
  }

  async function backfill(integrationId: string, fresh: boolean, context: JobContext) {
    await lock(integrationId, async () => {
      const integration = await load(integrationId);
      if (!integration || !SYNCING.includes(integration.status)) return;
      try {
        if (integration.kind === 'GOOGLE_SHEETS') {
          const client = createSheetsClient(
            env,
            googleAccess({
              prisma,
              encryption,
              env,
              integrationId,
              sealed: integration.credentialsEncrypted,
            }),
          );
          const prepared = await prepareSheet({
            prisma,
            client,
            integrationId,
            storedConfig: integration.config,
            form: formOf(integration),
            replaceMissing: true,
          });
          const added = await catchUpSheet({
            prisma,
            client,
            prepared,
            formId: integration.formId,
            fresh,
          });
          logger.info({ integrationId, added, fresh }, 'Copied responses to a Google Sheet');
        } else {
          await notionSync(deps).backfill(integration, formOf(integration), fresh);
        }
        await markSynced(integrationId);
      } catch (error) {
        await fail(integrationId, error, context);
      }
    });
  }

  async function syncOne(integrationId: string, submissionId: string, context: JobContext) {
    await lock(integrationId, async () => {
      const integration = await load(integrationId);
      // Paused or disconnected meanwhile: the catch-up when it comes back includes this one.
      if (!integration || !SYNCING.includes(integration.status)) return;
      const submission = await submissions.get(integration.formId, submissionId).catch(() => null);
      // Deleted meanwhile.
      if (!submission) return;
      try {
        if (integration.kind === 'GOOGLE_SHEETS') {
          const client = createSheetsClient(
            env,
            googleAccess({
              prisma,
              encryption,
              env,
              integrationId,
              sealed: integration.credentialsEncrypted,
            }),
          );
          const prepared = await prepareSheet({
            prisma,
            client,
            integrationId,
            storedConfig: integration.config,
            form: formOf(integration),
            replaceMissing: false,
          });
          await writeResponse({ client, prepared, submission });
        } else {
          await notionSync(deps).write(integration, formOf(integration), submission);
        }
        await markSynced(integrationId);
      } catch (error) {
        if (isSheetMissing(error)) {
          await fail(
            integrationId,
            new GoogleApiError(
              404,
              'The sheet was deleted, or Formyx can no longer open it. Re-sync to start a new one.',
            ),
            context,
          );
        }
        await fail(integrationId, error, context);
      }
    });
  }

  jobs.handle('integration.backfill', ({ integrationId, fresh = false }, context) =>
    backfill(integrationId, fresh, context),
  );
  jobs.handle('integration.sync', ({ integrationId, submissionId }, context) =>
    syncOne(integrationId, submissionId, context),
  );

  const queue = (change: SubmissionChange) => async (event: SubmissionEvent) => {
    const { formId, submission } = event;
    try {
      const integrations = await prisma.integration.findMany({
        where: { formId, status: { in: SYNCING } },
        select: { id: true, kind: true },
      });
      for (const { id, kind } of integrations) {
        // Paused while the plan lacks it; a backfill catches up once it is back.
        if (
          !(await formAllows(prisma, env.ENTITLEMENTS_MODE, formId, storedIntegrationFeature(kind)))
        ) {
          continue;
        }
        await jobs.send('integration.sync', {
          formId,
          integrationId: id,
          submissionId: submission.id,
          change,
        });
      }
    } catch (error) {
      logger.error(
        { formId, submissionId: submission.id, err: error },
        'Could not queue integration syncs',
      );
    }
  };
  const offCreated = events.on('submission.created', queue('created'));
  const offUpdated = events.on('submission.updated', queue('updated'));
  return () => {
    offCreated();
    offUpdated();
  };
}

/** Starts copying to an integration: everything so far, or everything again (`fresh`). */
export async function queueBackfill(
  prisma: Database,
  jobs: JobQueue,
  integration: { id: string; formId: string },
  { fresh = false }: { fresh?: boolean } = {},
): Promise<void> {
  if (fresh) {
    // A fresh copy rewrites the sheet's rows; the next backfill reads which are there.
    await prisma.integrationRecord.deleteMany({ where: { integrationId: integration.id } });
  }
  await jobs.send('integration.backfill', {
    formId: integration.formId,
    integrationId: integration.id,
    ...(fresh && { fresh: true }),
  });
}
