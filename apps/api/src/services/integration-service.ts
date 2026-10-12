import {
  hasRole,
  INTEGRATION_NAMES,
  notionConfigSchema,
  sheetConfigSchema,
  type ChatService,
  type FeatureId,
  type IntegrationKind,
  type IntegrationsOverview,
  type IntegrationView,
} from '@formyx/shared';
import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { IntegrationKind as StoredKind } from '../generated/prisma/client.js';
import { sealCredentials, openCredentials, type Credentials } from '../integrations/credentials.js';
import {
  exchangeGoogleCode,
  googleAuthorizeUrl,
  googleConfigured,
  revokeGoogleToken,
} from '../integrations/google.js';
import {
  exchangeNotionCode,
  notionAuthorizeUrl,
  notionConfigured,
} from '../integrations/notion.js';
import { signOAuthState, verifyOAuthState } from '../integrations/oauth-state.js';
import { queueBackfill } from '../integrations/sync.js';
import { createFailureService } from '../jobs/failures.js';
import type { JobQueue } from '../jobs/queue.js';
import { AppError } from '../lib/app-error.js';
import type { Encryption } from '../lib/encryption.js';
import type { Database } from '../lib/prisma.js';
import { findFormAccess } from '../middleware/auth.js';
import type { EntitlementService } from './entitlement-service.js';

/*
 * Connecting, pausing, re-syncing and disconnecting a form's integrations, and the
 * Integrations page's overview (integrations, chat channels, webhooks, failed jobs).
 */

const STORED_KIND: Record<IntegrationKind, StoredKind> = {
  google_sheets: 'GOOGLE_SHEETS',
  notion: 'NOTION',
};
const KIND: Record<StoredKind, IntegrationKind> = {
  GOOGLE_SHEETS: 'google_sheets',
  NOTION: 'notion',
};
export const INTEGRATION_FEATURE: Record<IntegrationKind, FeatureId> = {
  google_sheets: 'google_sheets',
  notion: 'notion',
};

/** The plan feature a stored integration needs. */
export function storedIntegrationFeature(kind: StoredKind): FeatureId {
  return INTEGRATION_FEATURE[KIND[kind]];
}

/** Why connecting didn't work, for the Integrations page to explain. */
export type ConnectError = 'denied' | 'expired' | 'not_allowed' | 'failed';

const integrationSelect = {
  id: true,
  kind: true,
  status: true,
  accountLabel: true,
  config: true,
  lastSyncedAt: true,
  lastError: true,
  lastErrorAt: true,
  createdAt: true,
  connectedBy: { select: { name: true } },
} as const;

export function createIntegrationService({
  prisma,
  env,
  encryption,
  jobs,
  entitlements,
  logger,
}: {
  prisma: Database;
  env: Env;
  encryption: Encryption;
  jobs: JobQueue;
  entitlements: EntitlementService;
  logger: Logger;
}) {
  const failures = createFailureService(prisma, jobs);
  const configured: Record<IntegrationKind, boolean> = {
    google_sheets: googleConfigured(env),
    notion: notionConfigured(env),
  };

  function toView(
    row: Awaited<
      ReturnType<typeof prisma.integration.findFirstOrThrow<{ select: typeof integrationSelect }>>
    >,
  ): IntegrationView {
    const kind = KIND[row.kind];
    let target: IntegrationView['target'] = null;
    if (kind === 'google_sheets') {
      const config = sheetConfigSchema.safeParse(row.config);
      if (config.success && config.data.spreadsheetUrl) {
        target = { name: 'Google Sheet', url: config.data.spreadsheetUrl };
      }
    } else {
      const config = notionConfigSchema.safeParse(row.config);
      if (config.success && config.data.databaseUrl) {
        target = {
          name: config.data.parentTitle
            ? `Database in “${config.data.parentTitle}”`
            : 'Notion database',
          url: config.data.databaseUrl,
        };
      }
    }
    return {
      id: row.id,
      kind,
      status: row.status.toLowerCase() as IntegrationView['status'],
      accountLabel: row.accountLabel,
      connectedBy: row.connectedBy?.name ?? null,
      target,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      lastError: row.lastError,
      lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async function find(formId: string, integrationId: string) {
    const row = await prisma.integration.findFirst({
      where: { id: integrationId, formId },
      select: { ...integrationSelect, formId: true, credentialsEncrypted: true },
    });
    if (!row) throw new AppError(404, 'NOT_FOUND', 'That integration is no longer connected.');
    return row;
  }

  return {
    failures,

    async overview(
      formId: string,
      chat: Record<ChatService, { hint: string } | null>,
    ): Promise<IntegrationsOverview> {
      const [integrations, webhooks, failed] = await Promise.all([
        prisma.integration.findMany({
          where: { formId },
          orderBy: { createdAt: 'asc' },
          select: integrationSelect,
        }),
        prisma.webhook.findMany({
          where: { formId },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            url: true,
            deliveries: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { succeeded: true, statusCode: true, createdAt: true },
            },
          },
        }),
        failures.list(formId),
      ]);
      return {
        integrations: integrations.map(toView),
        available: configured,
        chat,
        webhooks: webhooks.map(({ id, url, deliveries }) => {
          const [last] = deliveries;
          return {
            id,
            url,
            lastDelivery: last ? { ...last, createdAt: last.createdAt.toISOString() } : null,
          };
        }),
        failures: failed,
      };
    },

    /** Where to send the browser to connect `kind` to the form. */
    authorizeUrl(formId: string, userId: string, kind: IntegrationKind): string {
      if (!configured[kind]) {
        throw new AppError(
          503,
          'INTEGRATION_UNAVAILABLE',
          `${INTEGRATION_NAMES[kind]} isn't set up on this server yet.`,
        );
      }
      const state = signOAuthState({ userId, formId, kind }, env.JWT_SECRET);
      return kind === 'google_sheets'
        ? googleAuthorizeUrl(env, state)
        : notionAuthorizeUrl(env, state);
    },

    /**
     * Finishes connecting after the provider sends the person back: checks the state is
     * theirs and they may still edit the form, stores the sealed tokens and starts copying
     * responses. Returns the form to go back to, or why it didn't work.
     */
    async complete(
      kind: IntegrationKind,
      { code, state, error }: { code?: string; state?: string; error?: string },
      sessionUserId: string | null,
    ): Promise<{ formId: string | null; error: ConnectError | null }> {
      const verified = state ? verifyOAuthState(state, kind, env.JWT_SECRET) : null;
      if (!verified) return { formId: null, error: 'expired' };
      const { formId } = verified;
      if (error || !code) return { formId, error: 'denied' };
      // Started by someone else, or they're signed out now: never connect on their behalf.
      if (sessionUserId !== verified.userId) return { formId, error: 'expired' };
      const access = await findFormAccess(prisma, formId, verified.userId);
      if (!access?.role || !hasRole(access.role, 'EDITOR')) {
        return { formId, error: 'not_allowed' };
      }
      try {
        await entitlements.assertFeatures(access.workspaceId, [INTEGRATION_FEATURE[kind]]);
      } catch {
        return { formId, error: 'not_allowed' };
      }

      let credentials: Credentials;
      let accountLabel: string | null;
      try {
        if (kind === 'google_sheets') {
          const result = await exchangeGoogleCode(env, code);
          credentials = { kind: 'google', ...result.tokens };
          accountLabel = result.email;
        } else {
          const result = await exchangeNotionCode(env, code);
          credentials = { kind: 'notion', accessToken: result.accessToken };
          accountLabel = result.workspaceName;
        }
      } catch (caught) {
        logger.warn({ formId, kind, err: caught }, 'Could not finish connecting an integration');
        return { formId, error: 'failed' };
      }

      const storedKind = STORED_KIND[kind];
      const existing = await prisma.integration.findUnique({
        where: { formId_kind: { formId, kind: storedKind } },
        select: { id: true, accountLabel: true, config: true },
      });
      // Another account can't open what the old one made: start a new sheet or database.
      const keepTarget = existing !== null && existing.accountLabel === accountLabel;
      const data = {
        status: 'CONNECTING' as const,
        connectedById: verified.userId,
        accountLabel,
        credentialsEncrypted: sealCredentials(encryption, credentials),
        lastError: null,
        lastErrorAt: null,
        ...(!keepTarget && { config: {} }),
      };
      const integration = await prisma.integration.upsert({
        where: { formId_kind: { formId, kind: storedKind } },
        create: { formId, kind: storedKind, ...data },
        update: data,
        select: { id: true, formId: true },
      });
      if (!keepTarget) {
        await prisma.integrationRecord.deleteMany({ where: { integrationId: integration.id } });
      }
      await queueBackfill(prisma, jobs, integration);
      // What failed while it was disconnected goes again; the backfill covers new responses.
      if (keepTarget) await failures.retryIntegration(integration.id);
      return { formId, error: null };
    },

    /** Pausing stops copying; resuming catches up on what arrived meanwhile. */
    async setPaused(
      formId: string,
      integrationId: string,
      paused: boolean,
    ): Promise<IntegrationView> {
      const row = await find(formId, integrationId);
      if (row.status === 'NEEDS_RECONNECT') {
        throw new AppError(409, 'CONFLICT', 'Connect the account again first.');
      }
      if (paused) {
        await prisma.integration.update({ where: { id: row.id }, data: { status: 'PAUSED' } });
      } else if (row.status === 'PAUSED') {
        await prisma.integration.update({ where: { id: row.id }, data: { status: 'CONNECTING' } });
        await queueBackfill(prisma, jobs, row);
      }
      return toView(
        await prisma.integration.findUniqueOrThrow({
          where: { id: row.id },
          select: integrationSelect,
        }),
      );
    },

    /** Copies every response again, from a clean slate. */
    async resync(formId: string, integrationId: string): Promise<void> {
      const row = await find(formId, integrationId);
      if (row.status === 'NEEDS_RECONNECT') {
        throw new AppError(409, 'CONFLICT', 'Connect the account again first.');
      }
      await prisma.integration.update({
        where: { id: row.id },
        data: { status: 'CONNECTING', lastError: null, lastErrorAt: null },
      });
      await queueBackfill(prisma, jobs, row, { fresh: true });
    },

    /** Stops copying for good and gives up the account's access. The sheet or database stays. */
    async disconnect(formId: string, integrationId: string): Promise<void> {
      const row = await find(formId, integrationId);
      try {
        const credentials = openCredentials(encryption, row.credentialsEncrypted);
        if (credentials.kind === 'google') await revokeGoogleToken(env, credentials.refreshToken);
      } catch {
        // Unreadable or already revoked: nothing to give up.
      }
      await prisma.$transaction([
        prisma.jobFailure.deleteMany({ where: { integrationId: row.id } }),
        prisma.integration.delete({ where: { id: row.id } }),
      ]);
    },
  };
}
