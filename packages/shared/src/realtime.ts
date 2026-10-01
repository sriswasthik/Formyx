import { z } from 'zod';
import type { ApiErrorBody } from './errors.js';
import { submissionRecordSchema } from './forms/responses.js';

/**
 * Live updates over Socket.IO. The browser gets a short-lived token from
 * `GET /api/realtime/token`, connects with it, then joins the room of each form it shows.
 * The server checks membership before letting anyone join.
 */

/** Under `/api`, so whatever routes `/api` to the API (the Vite proxy, a load balancer) also routes sockets. */
export const REALTIME_PATH = '/api/socket.io';

/** Realtime tokens are only good for opening a connection, so they live briefly. */
export const REALTIME_TOKEN_TTL_SECONDS = 60;

export const realtimeTokenResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.iso.datetime(),
});
export type RealtimeTokenResponse = z.infer<typeof realtimeTokenResponseSchema>;

/** The Socket.IO room that hears about one form's responses. */
export function formRoom(formId: string): string {
  return `form:${formId}`;
}

export const formRoomInputSchema = z.object({ formId: z.string().min(1).max(64) });
export type FormRoomInput = z.infer<typeof formRoomInputSchema>;

/** The reply to `form:join`: our usual error shape when the join is refused. */
export type JoinFormResult = { ok: true } | ({ ok: false } & ApiErrorBody);

export const submissionCreatedEventSchema = z.object({
  formId: z.string(),
  submission: submissionRecordSchema,
});
export type SubmissionCreatedEvent = z.infer<typeof submissionCreatedEventSchema>;

export const submissionsDeletedEventSchema = z.object({
  formId: z.string(),
  ids: z.array(z.string()),
});
export type SubmissionsDeletedEvent = z.infer<typeof submissionsDeletedEventSchema>;

export interface ServerToClientEvents {
  'submission:created': (event: SubmissionCreatedEvent) => void;
  'submissions:deleted': (event: SubmissionsDeletedEvent) => void;
}

export interface ClientToServerEvents {
  'form:join': (input: FormRoomInput, reply: (result: JoinFormResult) => void) => void;
  'form:leave': (input: FormRoomInput) => void;
}
