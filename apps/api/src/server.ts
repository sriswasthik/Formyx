import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { Express } from 'express';
import type { Logger } from 'pino';
import { createApp } from './app.js';
import type { Env } from './config/env.js';
import { createEventBus, type EventBus } from './lib/events.js';
import type { Database } from './lib/prisma.js';
import { attachRealtime, type RealtimeServer } from './realtime/realtime-server.js';

export interface ServerDependencies {
  env: Env;
  logger: Logger;
  prisma: Database;
}

export interface FormyxServer {
  app: Express;
  /** Serves the REST API and the live-updates socket on one port. */
  httpServer: HttpServer;
  io: RealtimeServer;
  events: EventBus;
  /** Disconnects sockets and stops accepting connections. */
  close(): Promise<void>;
}

/** Everything the API runs: the Express app and live updates, wired together. */
export function createServer(deps: ServerDependencies): FormyxServer {
  const events = createEventBus(deps.logger);
  const app = createApp({ ...deps, events });
  const httpServer = createHttpServer(app);
  const io = attachRealtime(httpServer, { ...deps, events });

  return {
    app,
    httpServer,
    io,
    events,
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
