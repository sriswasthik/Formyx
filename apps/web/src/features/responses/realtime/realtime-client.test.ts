import type { JoinFormResult, SubmissionRecord } from '@formyx/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api';
import {
  createRealtimeClient,
  type FormListener,
  type RealtimeClient,
  type RealtimeSocket,
} from './realtime-client';

type Handler = (...args: unknown[]) => void;
type Auth = (callback: (data: { token?: string }) => void) => void;

/** Stands in for a Socket.IO socket, with the server's side driven by the test. */
class FakeSocket {
  connected = false;
  /** Like Socket.IO's: the client is trying to (re)connect by itself. */
  active = false;
  connectCalls = 0;
  joins: string[] = [];
  leaves: string[] = [];
  joinResult: JoinFormResult = { ok: true };
  lastAuth: { token?: string } | undefined;
  private handlers = new Map<string, Set<Handler>>();

  constructor(private readonly auth: Auth) {}

  on(event: string, handler: Handler) {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
    return this;
  }

  removeAllListeners() {
    this.handlers.clear();
    return this;
  }

  connect() {
    this.connectCalls += 1;
    this.active = true;
    return this;
  }

  disconnect() {
    this.connected = false;
    this.active = false;
    return this;
  }

  emit(event: string, input: { formId: string }) {
    if (event === 'form:leave') this.leaves.push(input.formId);
    return this;
  }

  timeout() {
    return {
      emitWithAck: (_event: string, input: { formId: string }) => {
        this.joins.push(input.formId);
        return Promise.resolve(this.joinResult);
      },
    };
  }

  fire(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }

  /** The server checks the handshake's token and lets the client in. */
  async accept() {
    this.lastAuth = await new Promise((resolve) => {
      this.auth(resolve);
    });
    this.connected = true;
    this.fire('connect');
    await flush();
  }

  /** The server refuses the handshake (bad or missing token). Socket.IO does not retry these. */
  async refuse() {
    this.lastAuth = await new Promise((resolve) => {
      this.auth(resolve);
    });
    this.active = false;
    this.fire('connect_error', new Error('UNAUTHORIZED'));
    await flush();
  }

  /** The network drops; Socket.IO reconnects by itself. */
  drop() {
    this.connected = false;
    this.fire('disconnect', 'transport close');
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function created(formId: string, id = 'sub_1') {
  const submission: SubmissionRecord = {
    id,
    createdAt: '2026-10-01T09:00:00.000Z',
    completionTimeMs: null,
    answers: {},
    metadata: { userAgent: null, referrer: null },
    outcome: null,
  };
  return { formId, submission };
}

function listener() {
  return {
    onCreated: vi.fn<FormListener['onCreated']>(),
    onUpdated: vi.fn<FormListener['onUpdated']>(),
    onDeleted: vi.fn<FormListener['onDeleted']>(),
    onResync: vi.fn<FormListener['onResync']>(),
  };
}

let socket: FakeSocket;
let getToken: ReturnType<typeof vi.fn<() => Promise<{ token: string }>>>;
let client: RealtimeClient;

beforeEach(() => {
  let issued = 0;
  getToken = vi.fn(() => {
    issued += 1;
    return Promise.resolve({ token: `token_${issued}` });
  });
  client = createRealtimeClient({
    getToken,
    createSocket: (auth) => {
      socket = new FakeSocket(auth);
      return socket as unknown as RealtimeSocket;
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createRealtimeClient', () => {
  it('connects with a fresh token once a form is followed, and goes live', async () => {
    expect(client.getStatus()).toBe('offline');

    client.subscribe('form_a', listener());
    expect(client.getStatus()).toBe('connecting');

    await socket.accept();
    expect(socket.lastAuth).toEqual({ token: 'token_1' });
    expect(client.getStatus()).toBe('live');
    expect(socket.joins).toEqual(['form_a']);
  });

  it("joins each form's room once, however many follow it", async () => {
    client.subscribe('form_a', listener());
    await socket.accept();
    client.subscribe('form_a', listener());
    client.subscribe('form_b', listener());
    await flush();

    expect(socket.joins).toEqual(['form_a', 'form_b']);
  });

  it('hands each form its own events, and drops malformed ones', async () => {
    const a = listener();
    const b = listener();
    client.subscribe('form_a', a);
    client.subscribe('form_b', b);
    await socket.accept();

    socket.fire('submission:created', created('form_a'));
    socket.fire('submission:updated', created('form_b'));
    socket.fire('submissions:deleted', { formId: 'form_b', ids: ['sub_9'] });
    socket.fire('submission:created', { formId: 'form_a', submission: { id: 42 } });
    socket.fire('submission:updated', { formId: 'form_b', submission: { id: 42 } });

    expect(a.onCreated).toHaveBeenCalledOnce();
    expect(a.onCreated).toHaveBeenCalledWith(created('form_a'));
    expect(a.onUpdated).not.toHaveBeenCalled();
    expect(b.onCreated).not.toHaveBeenCalled();
    expect(b.onUpdated).toHaveBeenCalledOnce();
    expect(b.onUpdated).toHaveBeenCalledWith(created('form_b'));
    expect(b.onDeleted).toHaveBeenCalledWith({ formId: 'form_b', ids: ['sub_9'] });
  });

  it('rejoins after the connection comes back, and asks to catch up on what was missed', async () => {
    const a = listener();
    client.subscribe('form_a', a);
    await socket.accept();
    expect(a.onResync).not.toHaveBeenCalled();

    socket.drop();
    expect(client.getStatus()).toBe('reconnecting');

    await socket.accept();
    expect(client.getStatus()).toBe('live');
    expect(socket.lastAuth).toEqual({ token: 'token_2' });
    expect(socket.joins).toEqual(['form_a', 'form_a']);
    expect(a.onResync).toHaveBeenCalledOnce();
  });

  it('tries again, with a new token, when the server refuses the connection', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    client.subscribe('form_a', listener());
    const refused = socket.refuse();
    await vi.advanceTimersByTimeAsync(0);
    await refused;
    expect(client.getStatus()).toBe('reconnecting');
    expect(socket.connectCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(socket.connectCalls).toBe(2);

    const accepted = socket.accept();
    await vi.advanceTimersByTimeAsync(0);
    await accepted;
    expect(socket.lastAuth).toEqual({ token: 'token_2' });
    expect(client.getStatus()).toBe('live');
  });

  it('gives up when the session has ended', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    getToken.mockRejectedValue(new ApiRequestError(401, 'UNAUTHORIZED', 'Log in to continue'));
    client.subscribe('form_a', listener());

    const refused = socket.refuse();
    await vi.advanceTimersByTimeAsync(0);
    await refused;
    await vi.advanceTimersByTimeAsync(60_000);

    expect(socket.lastAuth).toEqual({});
    expect(client.getStatus()).toBe('offline');
    expect(socket.connectCalls).toBe(1);
  });

  it('leaves the room when nobody follows a form, and disconnects a little later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const statuses: string[] = [];
    client.onStatusChange(() => statuses.push(client.getStatus()));
    const unsubscribe = client.subscribe('form_a', listener());
    const accepted = socket.accept();
    await vi.advanceTimersByTimeAsync(0);
    await accepted;

    unsubscribe();
    expect(socket.leaves).toEqual(['form_a']);
    expect(client.getStatus()).toBe('live');

    await vi.advanceTimersByTimeAsync(5000);
    expect(socket.connected).toBe(false);
    expect(statuses).toEqual(['connecting', 'live', 'offline']);
  });
});
