import {
  createDefaultTheme,
  createEmptyForm,
  createField,
  type FormDetail,
  type UpdateFormInput,
} from '@formyx/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api';
import { createEditorStore } from '../editor-store';
import { AUTOSAVE_DELAY_MS, Autosaver, FIRST_RETRY_MS } from './autosaver';

function detail(input: UpdateFormInput, version: number): FormDetail {
  return {
    id: 'form_1',
    workspaceId: 'ws_1',
    title: input.title ?? 'Survey',
    slug: 'survey-abc',
    status: 'DRAFT',
    version,
    responseCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
    draftSchema: input.draftSchema ?? createEmptyForm(),
    publishedSchema: null,
    publishedTitle: null,
    theme: createDefaultTheme(),
    publishedTheme: null,
  };
}

/** A save function that answers when told to. */
function controllableSave() {
  const calls: { input: UpdateFormInput; resolve: () => void; reject: (error: unknown) => void }[] =
    [];
  const save = vi.fn(
    (input: UpdateFormInput) =>
      new Promise<FormDetail>((resolve, reject) => {
        calls.push({
          input,
          resolve: () => {
            resolve(detail(input, input.version + 1));
          },
          reject,
        });
      }),
  );
  return { save, calls };
}

function setup() {
  const store = createEditorStore({ title: 'Survey', schema: createEmptyForm(), version: 1 });
  const { save, calls } = controllableSave();
  const onSaved = vi.fn();
  const autosaver = new Autosaver({ store, save, onSaved });
  autosaver.start();
  return { store, save, calls, onSaved, autosaver, state: () => autosaver.getState().kind };
}

/** Lets pending promise callbacks run. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Autosaver', () => {
  it('saves once, a second after the last change, with the version it started from', async () => {
    const { store, save, calls, state } = setup();

    store.getState().setTitle('Survey 2', { mergeKey: 'title' });
    expect(state()).toBe('unsaved');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100);
    store.getState().setTitle('Survey 26', { mergeKey: 'title' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
    expect(calls[0]?.input).toEqual({
      version: 1,
      title: 'Survey 26',
      draftSchema: store.getState().schema,
      theme: store.getState().theme,
    });
    expect(state()).toBe('saving');

    calls[0]?.resolve();
    await settle();
    expect(state()).toBe('saved');
    expect(store.getState()).toMatchObject({ version: 2, savedRevision: 2 });
  });

  it('saves changes made during a save right after it, with the new version', async () => {
    const { store, save, calls, state } = setup();

    store.getState().addField('email');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    store.getState().addField('phone');
    calls[0]?.resolve();
    await settle();
    expect(state()).toBe('unsaved');

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(calls[1]?.input.version).toBe(2);
    expect(calls[1]?.input.draftSchema?.fields).toHaveLength(2);

    calls[1]?.resolve();
    await settle();
    expect(state()).toBe('saved');
  });

  it('sends nothing while the draft has problems, and saves once they are fixed', async () => {
    const { store, save, state } = setup();
    const id = store.getState().addField('number');

    store.getState().updateField(id, { validation: { min: 10, max: 1 } });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(save).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({ revision: 2, savedRevision: 0 });
    expect(state()).toBe('invalid');

    store.getState().updateField(id, { validation: { min: 1, max: 10 } });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledOnce();
  });

  it('stops on a version conflict and resumes from the latest version', async () => {
    const { store, save, calls, state, autosaver } = setup();

    store.getState().setTitle('Mine');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    calls[0]?.reject(new ApiRequestError(409, 'CONFLICT', 'Changed elsewhere'));
    await settle();
    expect(state()).toBe('conflict');

    // Further edits are not sent, and nothing is retried.
    store.getState().setTitle('Mine 2');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledOnce();

    const latest = detail({ version: 6, title: 'Theirs' }, 7);
    autosaver.reload(latest);
    expect(state()).toBe('saved');
    expect(store.getState()).toMatchObject({ title: 'Theirs', version: 7, past: [] });

    store.getState().setTitle('Theirs, edited');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(calls[1]?.input.version).toBe(7);
  });

  it('retries with growing gaps when offline, then settles', async () => {
    const { store, save, calls, state } = setup();

    store.getState().setTitle('Offline edit');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    calls[0]?.reject(new ApiRequestError(0, 'NETWORK_ERROR', 'Could not reach the server'));
    await settle();
    expect(state()).toBe('offline');

    await vi.advanceTimersByTimeAsync(FIRST_RETRY_MS - 1);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);

    calls[1]?.reject(new ApiRequestError(0, 'NETWORK_ERROR', 'Could not reach the server'));
    await settle();
    await vi.advanceTimersByTimeAsync(FIRST_RETRY_MS * 2 - 1);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(3);

    calls[2]?.resolve();
    await settle();
    expect(state()).toBe('saved');
  });

  it('reports server errors separately from being offline', async () => {
    const { store, calls, state } = setup();

    store.getState().setTitle('Edit');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    calls[0]?.reject(new ApiRequestError(500, 'INTERNAL_ERROR', 'Something went wrong'));
    await settle();

    expect(state()).toBe('error');
  });

  it('saves immediately on flush', async () => {
    const { store, save, calls, autosaver } = setup();

    expect(await autosaver.flush()).toBe(true);
    expect(save).not.toHaveBeenCalled();

    store.getState().setTitle('Leaving now');
    const flushed = autosaver.flush();
    expect(save).toHaveBeenCalledOnce();
    calls[0]?.resolve();

    expect(await flushed).toBe(true);
    expect(autosaver.hasUnsavedChanges()).toBe(false);
  });

  it('reports a failed flush', async () => {
    const { store, calls, autosaver } = setup();

    store.getState().setTitle('Leaving now');
    const flushed = autosaver.flush();
    calls[0]?.reject(new ApiRequestError(0, 'NETWORK_ERROR', 'Offline'));

    expect(await flushed).toBe(false);
    expect(autosaver.hasUnsavedChanges()).toBe(true);
  });

  it('tells listeners about changes and stops everything when disposed', async () => {
    const { store, save, autosaver } = setup();
    const listener = vi.fn();
    autosaver.subscribe(listener);

    store.getState().addField('date');
    expect(listener).toHaveBeenCalled();

    autosaver.dispose();
    store.getState().addField('rating');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 5);
    expect(save).not.toHaveBeenCalled();
  });

  it('calls onSaved with the saved form', async () => {
    const { store, calls, onSaved } = setup();
    store.getState().addField('file');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    calls[0]?.resolve();
    await settle();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }));
  });

  it('ignores fields that are only selected', async () => {
    const { store, save, state } = setup();
    const id = createField('email').id;
    store.getState().selectField(id);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(save).not.toHaveBeenCalled();
    expect(state()).toBe('saved');
  });
});
