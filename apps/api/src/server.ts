import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { Express } from 'express';
import type { Logger } from 'pino';
import { createApp } from './app.js';
import type { Env } from './config/env.js';
import { createEventBus, type EventBus } from './lib/events.js';
import type { Mailer } from './lib/mailer.js';
import type { Database } from './lib/prisma.js';
import type { UploadStorage } from './lib/upload-storage.js';
import { createSecretBox } from './lib/webhook-signature.js';
import { createWebhookTransport, type WebhookTransport } from './lib/webhook-transport.js';
import { registerAutoresponder } from './notifications/autoresponder-notifier.js';
import { registerChatNotifier } from './notifications/chat-notifier.js';
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
  /** Defaults to the real dispatcher; tests pass one with short retry delays. */
  webhooks?: WebhookDispatcher;
  /** Defaults to real HTTPS requests; tests pass one that records them. */
  chat?: WebhookTransport;
}

export interface FormyxServer {
  app: Express;
  /** Serves the REST API and the live-updates socket on one port. */
  httpServer: HttpServer;
  io: RealtimeServer;
  events: EventBus;
  webhooks: WebhookDispatcher;
  /** Disconnects sockets and stops accepting connections. */
  close(): Promise<void>;
}

/**
 * Everything the API runs: the Express app, live updates, notification emails and webhooks,
 * wired together.
 */
export function createServer(deps: ServerDependencies): FormyxServer {
  const events = createEventBus(deps.logger);
  const webhooks = deps.webhooks ?? createDefaultWebhookDispatcher(deps);
  // Chat webhooks only ever go to Slack's and Discord's own hosts.
  const chat = deps.chat ?? createWebhookTransport({ allowPrivate: false });
  const app = createApp({ ...deps, events, webhooks, chat });
  const httpServer = createHttpServer(app);
  const io = attachRealtime(httpServer, { ...deps, events });
  registerSubmissionNotifier({ ...deps, events });
  registerChatNotifier({ ...deps, events, chat, secrets: createSecretBox(deps.env.JWT_SECRET) });
  registerAutoresponder({ ...deps, events });
  registerWebhookNotifier({ ...deps, events, webhooks });

  return {
    app,
    httpServer,
    io,
    events,
    webhooks,
    close: () =>
      new Promise((resolve, reject) => {
        // Retries still waiting are dropped; see the limitation in webhooks/dispatcher.ts.
        webhooks.close();
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
