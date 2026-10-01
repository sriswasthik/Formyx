import {
  apiErrorSchema,
  createEmptyForm,
  createField,
  REALTIME_PATH,
  REALTIME_TOKEN_TTL_SECONDS,
  realtimeTokenResponseSchema,
  submissionCreatedEventSchema,
  submissionsDeletedEventSchema,
  type ClientToServerEvents,
  type FormSchema,
  type ServerToClientEvents,
} from '@formyx/shared';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signRealtimeToken } from '../lib/realtime-token.js';
import { signSessionToken } from '../lib/session.js';
import { startTestServer, TEST_JWT_SECRET, type TestServer } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createPublishedForm, createSubmission } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const name = { ...createField('short_text'), label: 'Name' };
const SCHEMA: FormSchema = { ...createEmptyForm(), fields: [name] };

let server: TestServer;
let team: Team;
const sockets: ClientSocket[] = [];

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
  server = await startTestServer();
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await server.close();
});

function open(auth?: Record<string, unknown>): ClientSocket {
  const socket: ClientSocket = io(server.url, {
    path: REALTIME_PATH,
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    ...(auth && { auth }),
  });
  sockets.push(socket);
  return socket;
}

/** Resolves once the server accepts the connection. */
function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

/** Resolves with the error the server refused the connection with. */
function refused(socket: ClientSocket): Promise<Error & { data?: unknown }> {
  return new Promise((resolve, reject) => {
    socket.once('connect_error', resolve);
    socket.once('connect', () => {
      reject(new Error('The server accepted a connection it should have refused'));
    });
  });
}

const tokenFor = (userId: string) => signRealtimeToken(userId, TEST_JWT_SECRET).token;

async function connectAs(userId: string): Promise<ClientSocket> {
  const socket = open({ token: tokenFor(userId) });
  await connected(socket);
  return socket;
}

/** The payload of the next `event` the socket receives (callers validate it), or a timeout. */
function next(
  socket: ClientSocket,
  event: keyof ServerToClientEvents,
  timeoutMs = 3000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`No ${event} within ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('connecting', () => {
  it.each<[string, () => Record<string, unknown> | undefined]>([
    ['no token', () => undefined],
    ['a malformed token', () => ({ token: 'not-a-token' })],
    ['a token that is not a string', () => ({ token: 42 })],
    [
      'a token signed with another secret',
      () => ({ token: signRealtimeToken(team.users.OWNER, `${TEST_JWT_SECRET}-other`).token }),
    ],
  ])('refuses %s', async (_case, auth) => {
    const error = await refused(open(auth()));

    expect(error.message).toBe('UNAUTHORIZED');
    expect(apiErrorSchema.parse(error.data).error.code).toBe('UNAUTHORIZED');
  });

  it('refuses expired tokens', async () => {
    const issued = new Date(Date.now() - (REALTIME_TOKEN_TTL_SECONDS + 5) * 1000);
    const { token } = signRealtimeToken(team.users.OWNER, TEST_JWT_SECRET, issued);

    const error = await refused(open({ token }));

    expect(error.message).toBe('UNAUTHORIZED');
  });

  it('refuses session tokens, which are not meant for sockets', async () => {
    const error = await refused(
      open({ token: signSessionToken(team.users.OWNER, TEST_JWT_SECRET) }),
    );
    expect(error.message).toBe('UNAUTHORIZED');
  });

  it('accepts the token that GET /api/realtime/token hands out', async () => {
    const res = await requestAs(server.app, team.users.VIEWER)
      .get('/api/realtime/token')
      .expect(200);
    const { token, expiresAt } = realtimeTokenResponseSchema.parse(res.body);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(new Date(expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(
      REALTIME_TOKEN_TTL_SECONDS * 1000,
    );
    await connected(open({ token }));
  });

  it('only hands out tokens to signed-in users', async () => {
    await request(server.app).get('/api/realtime/token').expect(401);
  });
});

describe('form rooms', () => {
  it('let members join', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const socket = await connectAs(team.users.VIEWER);

    expect(await socket.emitWithAck('form:join', { formId: form.id })).toEqual({ ok: true });
  });

  it('refuse people from other workspaces, missing forms and malformed requests', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const stranger = await prisma.user.create({
      data: { name: 'Eve', email: 'eve@example.com', passwordHash: 'x' },
    });
    const socket = await connectAs(stranger.id);

    const outsider = await socket.emitWithAck('form:join', { formId: form.id });
    const missing = await socket.emitWithAck('form:join', { formId: 'missing' });
    const malformed = await socket.emitWithAck('form:join', { formId: '' });

    expect(outsider).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(malformed).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('tell members about new responses to the forms they joined, and nobody else', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const other = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const watching = await connectAs(team.users.VIEWER);
    const elsewhere = await connectAs(team.users.EDITOR);
    await watching.emitWithAck('form:join', { formId: form.id });
    await elsewhere.emitWithAck('form:join', { formId: other.id });
    let strayEvents = 0;
    elsewhere.on('submission:created', () => {
      strayEvents += 1;
    });

    const received = next(watching, 'submission:created');
    const res = await request(server.app)
      .post(`/api/public/forms/${form.slug}/submissions`)
      .send({ answers: { [name.id]: 'Ada' }, completionTimeMs: 1200 })
      .expect(201);

    const event = submissionCreatedEventSchema.parse(await received);
    expect(event).toMatchObject({
      formId: form.id,
      submission: {
        id: (res.body as { id: string }).id,
        answers: { [name.id]: 'Ada' },
        completionTimeMs: 1200,
      },
    });
    expect(strayEvents).toBe(0);
  });

  it('tell members about deleted responses', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const submission = await createSubmission(prisma, form.id);
    const watching = await connectAs(team.users.VIEWER);
    await watching.emitWithAck('form:join', { formId: form.id });

    const received = next(watching, 'submissions:deleted');
    await requestAs(server.app, team.users.EDITOR)
      .delete(`/api/forms/${form.id}/submissions/${submission.id}`)
      .expect(204);

    expect(submissionsDeletedEventSchema.parse(await received)).toEqual({
      formId: form.id,
      ids: [submission.id],
    });
  });

  it('stop sending updates once a member leaves', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const submission = await createSubmission(prisma, form.id);
    const socket = await connectAs(team.users.VIEWER);
    await socket.emitWithAck('form:join', { formId: form.id });
    socket.emit('form:leave', { formId: form.id });
    // Round-trip a join for another form so the leave is processed first.
    await socket.emitWithAck('form:join', { formId: 'missing' });

    const received = next(socket, 'submissions:deleted', 500);
    await requestAs(server.app, team.users.EDITOR)
      .delete(`/api/forms/${form.id}/submissions/${submission.id}`)
      .expect(204);

    await expect(received).rejects.toThrow('No submissions:deleted');
  });
});
