import type { SubmissionRecord } from '@formyx/shared';
import type { Logger } from 'pino';
import { reportError } from './monitoring.js';

/** A response saved or changed through the public form. */
export interface SubmissionEvent {
  formId: string;
  submission: SubmissionRecord;
  /** The address the respondent gave before the questions, if the form asked. */
  respondentEmail?: string | null;
  /** The private link's token for changing the response, when the form allows it. */
  editToken?: string | null;
}

/** Things that happened, for whoever wants to react: live updates, notification emails. */
export interface DomainEvents {
  'submission.created': SubmissionEvent;
  /** A respondent changed their response through its private link. */
  'submission.updated': SubmissionEvent;
  'submissions.deleted': { formId: string; ids: string[] };
  /** Someone signed up. */
  'account.created': { userId: string };
  /** Someone published a form (the first time, or again). */
  'form.published': { formId: string; userId: string };
}

type Listener<K extends keyof DomainEvents> = (event: DomainEvents[K]) => void | Promise<void>;

export interface EventBus {
  /** Returns a function that removes the listener. */
  on<K extends keyof DomainEvents>(type: K, listener: Listener<K>): () => void;
  /**
   * Tells every listener, after the current request has had its turn: emitting never waits
   * for listeners, and a listener that throws or rejects is logged, never passed back.
   */
  emit<K extends keyof DomainEvents>(type: K, event: DomainEvents[K]): void;
}

export function createEventBus(logger: Logger): EventBus {
  const listeners = new Map<keyof DomainEvents, Set<Listener<never>>>();

  const report = (type: keyof DomainEvents, error: unknown) => {
    logger.error({ err: error, event: type }, 'An event listener failed');
    reportError(error, { event: type });
  };

  return {
    on(type, listener) {
      const set = listeners.get(type) ?? new Set();
      listeners.set(type, set);
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },

    emit(type, event) {
      for (const listener of listeners.get(type) ?? []) {
        setImmediate(() => {
          try {
            Promise.resolve((listener as Listener<typeof type>)(event)).catch((error: unknown) => {
              report(type, error);
            });
          } catch (error) {
            report(type, error);
          }
        });
      }
    },
  };
}
