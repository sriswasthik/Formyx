import type { FormDetail, UpdateFormInput } from '@formyx/shared';
import { ApiRequestError } from '@/lib/api';
import { findDraftIssues } from '../draft-issues';
import type { EditorStore } from '../editor-store';

export type SaveState =
  | { kind: 'saved' }
  | { kind: 'unsaved' }
  | { kind: 'saving' }
  /** The draft would be rejected; nothing is sent until it is fixed. */
  | { kind: 'invalid'; issues: number }
  /** The network failed; retrying. */
  | { kind: 'offline' }
  /** The server failed; retrying. */
  | { kind: 'error' }
  /** Someone else saved first; saving is paused until the latest version is loaded. */
  | { kind: 'conflict' };

export const AUTOSAVE_DELAY_MS = 1000;
export const FIRST_RETRY_MS = 2000;
export const MAX_RETRY_MS = 30_000;

interface AutosaverOptions {
  store: EditorStore;
  save: (input: UpdateFormInput) => Promise<FormDetail>;
  onSaved?: (form: FormDetail) => void;
  delayMs?: number;
}

/**
 * Saves the editor's draft a moment after changes stop, one request at a time, sending the
 * version it started from. Retries with growing gaps when saving fails, and stops on a
 * version conflict so it never overwrites someone else's changes.
 */
export class Autosaver {
  private state: SaveState = { kind: 'saved' };
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<boolean> | null = null;
  private retryMs = 0;
  private unsubscribe: (() => void) | undefined;

  constructor(private readonly options: AutosaverOptions) {}

  getState = (): SaveState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  hasUnsavedChanges = (): boolean => {
    const { revision, savedRevision } = this.options.store.getState();
    return revision !== savedRevision;
  };

  start(): void {
    this.unsubscribe = this.options.store.subscribe((next, previous) => {
      if (next.revision !== previous.revision) this.onChange();
    });
  }

  /** Stops watching and saving; `start()` can pick up again (React strict mode does). */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    clearTimeout(this.timer);
  }

  /** Saves now instead of waiting; resolves `true` once nothing is left unsaved. */
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.inFlight) await this.inFlight;
    if (!this.hasUnsavedChanges()) return true;
    return this.run();
  }

  /** Retries straight away, e.g. from a "Retry" button. */
  retryNow(): void {
    this.retryMs = 0;
    void this.flush();
  }

  /** Continues from the server's latest copy after a conflict, discarding local changes. */
  reload(form: FormDetail): void {
    clearTimeout(this.timer);
    this.retryMs = 0;
    this.options.store.getState().reset({
      title: form.title,
      schema: form.draftSchema,
      version: form.version,
      theme: form.theme,
    });
    this.setState({ kind: 'saved' });
  }

  private setState(state: SaveState): void {
    if (JSON.stringify(state) === JSON.stringify(this.state)) return;
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  private onChange(): void {
    if (this.state.kind === 'conflict') return;
    if (!this.hasUnsavedChanges()) {
      if (!this.inFlight) this.setState({ kind: 'saved' });
      return;
    }
    const issues = findDraftIssues(this.options.store.getState()).length;
    if (issues > 0) {
      clearTimeout(this.timer);
      if (!this.inFlight) this.setState({ kind: 'invalid', issues });
      return;
    }
    // A new edit also cancels a pending retry: it is saved on the normal schedule instead.
    this.retryMs = 0;
    if (!this.inFlight) this.setState({ kind: 'unsaved' });
    this.schedule(this.options.delayMs ?? AUTOSAVE_DELAY_MS);
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.run();
    }, ms);
  }

  private async run(): Promise<boolean> {
    if (this.state.kind === 'conflict') return false;
    if (this.inFlight) return this.inFlight;

    const { title, schema, theme, version, revision } = this.options.store.getState();
    const issues = findDraftIssues({ title, schema }).length;
    if (issues > 0) {
      this.setState({ kind: 'invalid', issues });
      return false;
    }

    this.setState({ kind: 'saving' });
    this.inFlight = this.options
      .save({ version, title, draftSchema: schema, theme })
      .then((form) => {
        this.options.store.getState().markSaved(revision, form.version);
        this.options.onSaved?.(form);
        this.retryMs = 0;
        return true;
      })
      .catch((error: unknown) => {
        if (error instanceof ApiRequestError && error.status === 409) {
          this.setState({ kind: 'conflict' });
          return false;
        }
        const offline = error instanceof ApiRequestError && error.code === 'NETWORK_ERROR';
        this.setState({ kind: offline ? 'offline' : 'error' });
        this.retryMs = this.retryMs ? Math.min(this.retryMs * 2, MAX_RETRY_MS) : FIRST_RETRY_MS;
        this.schedule(this.retryMs);
        return false;
      })
      .finally(() => {
        this.inFlight = null;
      });

    const saved = await this.inFlight;
    if (saved) {
      if (this.hasUnsavedChanges()) {
        // Edits made while saving go out next, on the normal schedule.
        this.onChange();
      } else {
        this.setState({ kind: 'saved' });
      }
    }
    return saved;
  }
}
