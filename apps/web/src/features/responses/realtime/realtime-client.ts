import {
  REALTIME_PATH,
  submissionCreatedEventSchema,
  submissionsDeletedEventSchema,
  type ClientToServerEvents,
  type JoinFormResult,
  type ServerToClientEvents,
  type SubmissionCreatedEvent,
  type SubmissionsDeletedEvent,
} from '@formyx/shared';
import { io, type Socket } from 'socket.io-client';
import { ApiRequestError } from '@/lib/api';
import { getRealtimeToken } from '../responses-api';

/** `connecting` before the first connection; `reconnecting` while getting one back. */
export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface FormListener {
  onCreated: (event: SubmissionCreatedEvent) => void;
  onDeleted: (event: SubmissionsDeletedEvent) => void;
  /** Back after a gap, during which events may have been missed: fetch afresh. */
  onResync: () => void;
}

export interface RealtimeClient {
  /** Follows a form's responses until the returned function is called. */
  subscribe: (formId: string, listener: FormListener) => () => void;
  getStatus: () => LiveStatus;
  onStatusChange: (callback: () => void) => () => void;
}

type AuthCallback = (data: { token?: string }) => void;

interface RealtimeClientOptions {
  /** Hands out a short-lived token for each connection attempt. */
  getToken: () => Promise<{ token: string }>;
  /** Makes the (not yet connected) socket. Tests pass a fake. */
  createSocket: (auth: (callback: AuthCallback) => void) => RealtimeSocket;
}

/** After the last form stops following, the connection stays a while for the next page. */
const IDLE_DISCONNECT_MS = 5000;
const JOIN_TIMEOUT_MS = 10_000;
const RETRY_INITIAL_MS = 1000;
const RETRY_MAX_MS = 30_000;

export function createRealtimeClient({
  getToken,
  createSocket,
}: RealtimeClientOptions): RealtimeClient {
  let socket: RealtimeSocket | null = null;
  let status: LiveStatus = 'offline';
  let connectedBefore = false;
  /** The session is over: retrying cannot help until the user logs in again. */
  let sessionEnded = false;
  let retryDelay = RETRY_INITIAL_MS;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const statusListeners = new Set<() => void>();
  const subscriptions = new Map<string, Set<FormListener>>();

  const setStatus = (next: LiveStatus) => {
    if (status === next) return;
    status = next;
    for (const callback of statusListeners) callback();
  };

  const join = (formId: string, resync: boolean) => {
    if (!socket?.connected) return;
    socket
      .timeout(JOIN_TIMEOUT_MS)
      .emitWithAck('form:join', { formId })
      .then((result: JoinFormResult) => {
        if (result.ok && resync) {
          for (const listener of subscriptions.get(formId) ?? []) listener.onResync();
        }
        // A refused join means the member lost access; the page's own requests will say so.
      })
      .catch(() => {
        // No answer in time: the next reconnect joins again.
      });
  };

  /** The server refused the connection (e.g. a token that expired on the way): try again later. */
  const retryLater = () => {
    setStatus('reconnecting');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      socket?.connect();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
  };

  const open = (): RealtimeSocket => {
    const created = createSocket((callback) => {
      getToken().then(
        ({ token }) => {
          callback({ token });
        },
        (error: unknown) => {
          if (error instanceof ApiRequestError && error.status === 401) sessionEnded = true;
          // Without a token the server refuses the connection, which `connect_error` handles.
          callback({});
        },
      );
    });

    created.on('connect', () => {
      clearTimeout(retryTimer);
      retryDelay = RETRY_INITIAL_MS;
      setStatus('live');
      const resync = connectedBefore;
      connectedBefore = true;
      for (const formId of subscriptions.keys()) join(formId, resync);
    });

    created.on('disconnect', () => {
      // `active`: the client reconnects by itself (network trouble, server restart).
      if (created.active) setStatus('reconnecting');
      else if (subscriptions.size > 0) retryLater();
      else setStatus('offline');
    });

    created.on('connect_error', () => {
      if (created.active) {
        setStatus(connectedBefore ? 'reconnecting' : 'connecting');
      } else if (sessionEnded) {
        setStatus('offline');
      } else {
        retryLater();
      }
    });

    created.on('submission:created', (payload) => {
      const event = submissionCreatedEventSchema.safeParse(payload);
      if (!event.success) return;
      for (const listener of subscriptions.get(event.data.formId) ?? [])
        listener.onCreated(event.data);
    });

    created.on('submissions:deleted', (payload) => {
      const event = submissionsDeletedEventSchema.safeParse(payload);
      if (!event.success) return;
      for (const listener of subscriptions.get(event.data.formId) ?? [])
        listener.onDeleted(event.data);
    });

    return created;
  };

  const ensureConnection = () => {
    clearTimeout(idleTimer);
    if (!socket) {
      socket = open();
      connectedBefore = false;
    }
    if (!socket.connected && !socket.active && retryTimer === undefined) {
      sessionEnded = false;
      setStatus(connectedBefore ? 'reconnecting' : 'connecting');
      socket.connect();
    }
  };

  const close = () => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;
    connectedBefore = false;
    retryDelay = RETRY_INITIAL_MS;
    setStatus('offline');
  };

  return {
    subscribe(formId, listener) {
      let listeners = subscriptions.get(formId);
      const firstForForm = !listeners;
      if (!listeners) {
        listeners = new Set();
        subscriptions.set(formId, listeners);
      }
      listeners.add(listener);
      ensureConnection();
      if (firstForForm) join(formId, false);

      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        subscriptions.delete(formId);
        if (socket?.connected) socket.emit('form:leave', { formId });
        if (subscriptions.size === 0) {
          clearTimeout(idleTimer);
          idleTimer = setTimeout(close, IDLE_DISCONNECT_MS);
        }
      };
    },

    getStatus: () => status,

    onStatusChange(callback) {
      statusListeners.add(callback);
      return () => {
        statusListeners.delete(callback);
      };
    },
  };
}

/** Same origin unless `VITE_REALTIME_URL` names another (the API may live elsewhere). */
function createBrowserSocket(auth: (callback: AuthCallback) => void): RealtimeSocket {
  const options = {
    path: REALTIME_PATH,
    autoConnect: false,
    // WebSockets only: no long-polling, so no sticky sessions are needed behind a load balancer.
    transports: ['websocket'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    auth,
  };
  const url = import.meta.env.VITE_REALTIME_URL;
  return url ? io(url, options) : io(options);
}

/** The app's one live-updates connection, opened while some page follows a form. */
export const realtimeClient = createRealtimeClient({
  getToken: getRealtimeToken,
  createSocket: createBrowserSocket,
});
