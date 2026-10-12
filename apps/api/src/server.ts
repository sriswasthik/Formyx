import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { Express } from 'express';
import type { Logger } from 'pino';
import { createApp } from './app.js';
import type { Env } from './config/env.js';
import type { JobQueue } from './jobs/queue.js';
import { registerIntegrationJobs } from './integrations/sync.js';
import { registerUpkeep } from './jobs/upkeep.js';
import { encryptionFromEnv } from './lib/encryption.js';
import { createEventBus, type EventBus } from './lib/events.js';
import type { Mailer } from './lib/mailer.js';
import type { Database } from './lib/prisma.js';
import { createProductAnalytics, type ProductAnalytics } from './lib/product-analytics.js';
import type { UploadStorage } from './lib/upload-storage.js';
import { createWebhookTransport, type WebhookTransport } from './lib/webhook-transport.js';
import { registerAutoresponder } from './notifications/autoresponder-notifier.js';
import { registerChatNotifier } from './notifications/chat-notifier.js';
import { registerEmailJobs } from './notifications/email-jobs.js';
import { registerSubmissionNotifier } from './notifications/submission-notifier.js';
import { attachRealtime, type RealtimeServer } from './realtime/realtime-server.js';
import { createDefaultWebhookDispatcher, type WebhookDispatcher } from './webhooks/dispatcher.js';
import { registerWebhookNotifier } from './webhooks/notifier.js';

export interface ServerDependencies {
  env: Env;
  logger: Logger;
  prisma: Database;
  mailer: Mailer;
  storage: UploadStorage | null;
  /** Background jobs: pg-boss in production (see jobs/queue.ts), in memory in tests. */
  jobs: JobQueue;
  /** Defaults to the real dispatcher. */
  webhooks?: WebhookDispatcher;
  /** Defaults to real HTTPS requests; tests pass one that records them. */
  chat?: WebhookTransport;
  /** Defaults to PostHog (sending nothing unless POSTHOG_KEY is set). */
  analytics?: ProductAnalytics;
}

export interface FormyxServer {
  app: Express;
  /** Serves the REST API and the live-updates socket on one port. */
  httpServer: HttpServer;
  io: RealtimeServer;
  events: EventBus;
  jobs: JobQueue;
  analytics: ProductAnalytics;
  /** Disconnects sockets and stops accepting connections. The job queue is stopped apart. */
  close(): Promise<void>;
}

/**
 * Everything the API runs: the Express app, live updates, and what happens after a response
 * (emails, chat posts, webhooks, integrations), wired together. Handlers are registered on
 * the job queue here; starting the queue is up to the caller.
 */
export function createServer(deps: ServerDependencies): FormyxServer {
  const events = createEventBus(deps.logger);
  const encryption = encryptionFromEnv(deps.env);
  const webhooks = deps.webhooks ?? createDefaultWebhookDispatcher(deps);
  // Chat webhooks only ever go to Slack's and Discord's own hosts.
  const chat = deps.chat ?? createWebhookTransport({ allowPrivate: false });
  const analytics = deps.analytics ?? createProductAnalytics(deps);
  const app = createApp({ ...deps, events, webhooks, chat, analytics });
  const httpServer = createHttpServer(app);
  const io = attachRealtime(httpServer, { ...deps, events });
  const background = { ...deps, events, encryption };
  registerEmailJobs(deps.jobs, deps.mailer, encryption);
  registerSubmissionNotifier(background);
  registerChatNotifier({ ...background, chat });
  registerAutoresponder(background);
  registerWebhookNotifier({ ...background, webhooks });
  registerIntegrationJobs(background);
  registerUpkeep(background);

  return {
    app,
    httpServer,
    io,
    events,
    jobs: deps.jobs,
    analytics,
    close: () =>
      new Promise((resolve, reject) => {
        // Closes the HTTP server too.
        void io.close((error) => {
          if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}
