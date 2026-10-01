import type { Server as HttpServer } from 'node:http';
import {
  createApiError,
  formRoom,
  formRoomInputSchema,
  REALTIME_PATH,
  type ClientToServerEvents,
  type JoinFormResult,
  type ServerToClientEvents,
} from '@formyx/shared';
import type { Logger } from 'pino';
import { Server } from 'socket.io';
import type { Env } from '../config/env.js';
import type { EventBus } from '../lib/events.js';
import type { Database } from '../lib/prisma.js';
import { verifyRealtimeToken } from '../lib/realtime-token.js';
import { findFormAccess } from '../middleware/auth.js';

interface SocketData {
  userId: string;
}

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

interface RealtimeDependencies {
  env: Pick<Env, 'JWT_SECRET' | 'CORS_ORIGIN'>;
  logger: Logger;
  prisma: Database;
  events: EventBus;
}

/** One tab rarely shows more than a form or two; this caps what a single socket can ask for. */
const MAX_ROOMS_PER_SOCKET = 20;

/** Clients only ever send small join and leave messages. */
const MAX_MESSAGE_BYTES = 10_000;

/**
 * Live updates. A connection needs a realtime token (from `GET /api/realtime/token`) in its
 * handshake, and joins a form's room only after the same membership check as the REST API.
 * Saved and deleted responses are broadcast to the form's room.
 */
export function attachRealtime(
  httpServer: HttpServer,
  { env, logger, prisma, events }: RealtimeDependencies,
): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, {
    path: REALTIME_PATH,
    serveClient: false,
    // The token is the credential, so cookies are neither needed nor sent.
    cors: { origin: env.CORS_ORIGIN, credentials: false },
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
  });

  io.use((socket, next) => {
    const token: unknown = (socket.handshake.auth as Record<string, unknown>).token;
    const userId = typeof token === 'string' ? verifyRealtimeToken(token, env.JWT_SECRET) : null;
    if (!userId) {
      const error = new Error('UNAUTHORIZED') as Error & { data?: unknown };
      error.data = createApiError('UNAUTHORIZED', 'Your live updates token is missing or expired');
      next(error);
      return;
    }
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    const refuse = (
      reply: (result: JoinFormResult) => void,
      ...error: Parameters<typeof createApiError>
    ) => {
      reply({ ok: false, ...createApiError(...error) });
    };

    socket.on('form:join', async (input, reply) => {
      // Clients that send no acknowledgement callback get nothing.
      if (typeof reply !== 'function') return;

      const parsed = formRoomInputSchema.safeParse(input);
      if (!parsed.success) {
        refuse(reply, 'VALIDATION_ERROR', 'Send the id of a form to join');
        return;
      }
      const { formId } = parsed.data;
      // Rooms include the socket's own id room.
      if (socket.rooms.size > MAX_ROOMS_PER_SOCKET) {
        refuse(reply, 'RATE_LIMITED', 'Too many forms followed on this connection');
        return;
      }

      try {
        const access = await findFormAccess(prisma, formId, socket.data.userId);
        if (!access) {
          refuse(reply, 'NOT_FOUND', 'Form not found');
          return;
        }
        if (!access.role) {
          refuse(reply, 'FORBIDDEN', 'You are not a member of this workspace');
          return;
        }
        await socket.join(formRoom(formId));
        reply({ ok: true });
      } catch (error) {
        logger.error({ err: error, formId }, 'Could not join a realtime room');
        refuse(reply, 'INTERNAL_ERROR', 'Something went wrong');
      }
    });

    socket.on('form:leave', async (input) => {
      const parsed = formRoomInputSchema.safeParse(input);
      if (parsed.success) await socket.leave(formRoom(parsed.data.formId));
    });
  });

  events.on('submission.created', (event) => {
    io.to(formRoom(event.formId)).emit('submission:created', event);
  });
  events.on('submissions.deleted', (event) => {
    io.to(formRoom(event.formId)).emit('submissions:deleted', event);
  });

  return io;
}
