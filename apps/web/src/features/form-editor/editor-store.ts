import {
  createDefaultTheme,
  createField,
  createId,
  removeBrokenConditions,
  type Field,
  type FieldType,
  type FormSchema,
  type FormSettings,
  type FormTheme,
} from '@formyx/shared';
import { current, original, type Draft } from 'immer';
import { immer } from 'zustand/middleware/immer';
import { createStore, type StoreApi } from 'zustand/vanilla';

export const MAX_HISTORY = 100;
/** Changes with the same merge key this close together become one undo step. */
export const MERGE_WINDOW_MS = 1000;

/** What undo and redo restore. */
export interface EditorSnapshot {
  title: string;
  schema: FormSchema;
  theme: FormTheme;
  selectedFieldId: string | null;
}

type KeysOfUnion<T> = T extends unknown ? keyof T : never;
type EditableKey = Exclude<KeysOfUnion<Field>, 'id' | 'type'>;

/** Properties to change on a field. `undefined` removes a property. */
export type FieldPatch = {
  [K in EditableKey]?: Extract<Field, Partial<Record<K, unknown>>>[K] | undefined;
};

/** Theme settings to change. `undefined` removes the logo or cover image. */
export type ThemePatch = { [K in keyof FormTheme]?: FormTheme[K] | undefined };

/** Settings to change. `undefined` removes an optional setting (e.g. `closeAt`). */
export type SettingsPatch = { [K in keyof FormSettings]?: FormSettings[K] | undefined };

export interface ChangeOptions {
  /**
   * Consecutive changes with the same key (e.g. `label:fld_1`) within a second merge into a
   * single undo step, so typing a word is undone in one go.
   */
  mergeKey?: string;
}

export interface EditorState extends EditorSnapshot {
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  lastChange: { key: string; at: number } | null;
  /** Bumped by every change to the title, schema or theme, including undo and redo. */
  revision: number;
  /** The revision last saved; the draft has unsaved changes while they differ. */
  savedRevision: number;
  /** Server version the draft is based on, sent with every save. */
  version: number;

  /** Inserts a new question (at the end by default), selects it and returns its id. */
  addField: (type: FieldType, index?: number) => string;
  updateField: (id: string, patch: FieldPatch, options?: ChangeOptions) => void;
  removeField: (id: string) => void;
  /** Copies a question (with new ids) right below it, selects the copy and returns its id. */
  duplicateField: (id: string) => string | null;
  /** Moves a question so it ends up at `toIndex`. */
  moveField: (id: string, toIndex: number) => void;
  selectField: (id: string | null) => void;
  updateSettings: (patch: SettingsPatch, options?: ChangeOptions) => void;
  setTitle: (title: string, options?: ChangeOptions) => void;
  /** Sets the text shown under the title; an empty string removes it. */
  setDescription: (description: string, options?: ChangeOptions) => void;
  /** Changes how the form looks. */
  updateTheme: (patch: ThemePatch, options?: ChangeOptions) => void;
  undo: () => void;
  redo: () => void;
  markSaved: (revision: number, version: number) => void;
  /** Starts over from the server's copy, e.g. after a conflict; clears history. */
  reset: (form: EditorSource) => void;
}

/** What an editor starts from: the form as the server has it. */
export interface EditorSource {
  title: string;
  schema: FormSchema;
  version: number;
  /** Defaults to the standard theme. */
  theme?: FormTheme;
}

export interface EditorStoreOptions {
  /**
   * Called when a change made other questions' conditions invalid and they were removed.
   * `undo` reverts that change, e.g. from a toast.
   */
  onConditionsRemoved?: (count: number, undo: () => void) => void;
  /** Clock for merging edits; tests pass a fake one. */
  now?: () => number;
}

export type EditorStore = StoreApi<EditorState>;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function snapshotOf({ title, schema, theme, selectedFieldId }: EditorSnapshot): EditorSnapshot {
  return { title, schema, theme, selectedFieldId };
}

function isSame(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A copy of a question with fresh ids for it and its options. */
function copyField(field: Field): Field {
  const copy = { ...structuredClone(field), id: createId('fld') };
  if ('options' in copy) {
    copy.options = copy.options.map((option) => ({ ...option, id: createId('opt') }));
  }
  return copy;
}

/** Patch keys that can invalidate conditions on later questions. */
const STRUCTURAL_KEYS: readonly EditableKey[] = ['options', 'ratingScale'];

export function createEditorStore(
  initial: EditorSource,
  { onConditionsRemoved, now = Date.now }: EditorStoreOptions = {},
): EditorStore {
  return createStore<EditorState>()(
    immer((set, get) => {
      /**
       * Applies an undoable change: records the state before it (unless it merges into the
       * previous step), clears redo, and optionally drops conditions the change broke.
       */
      const change = (
        recipe: (draft: Draft<EditorState>) => void,
        { mergeKey, prune = false }: ChangeOptions & { prune?: boolean } = {},
      ) => {
        let removed = 0;
        set((state) => {
          const base = original(state);
          const time = now();
          const merges =
            mergeKey !== undefined &&
            state.lastChange?.key === mergeKey &&
            time - state.lastChange.at <= MERGE_WINDOW_MS;

          if (!merges) {
            state.past.push(snapshotOf(base));
            if (state.past.length > MAX_HISTORY)
              state.past.splice(0, state.past.length - MAX_HISTORY);
          }
          state.future = [];

          recipe(state);

          if (prune) {
            const result = removeBrokenConditions(current(state.schema));
            if (result.removed > 0) {
              state.schema = result.form;
              removed = result.removed;
            }
          }
          state.lastChange = mergeKey ? { key: mergeKey, at: time } : null;
          state.revision += 1;
        });
        if (removed > 0) {
          onConditionsRemoved?.(removed, () => {
            get().undo();
          });
        }
      };

      /** Makes `snapshot` current, keeping the selection only if that question still exists. */
      const restore = (state: Draft<EditorState>, snapshot: EditorSnapshot) => {
        state.title = snapshot.title;
        state.schema = snapshot.schema;
        state.theme = snapshot.theme;
        state.selectedFieldId = snapshot.schema.fields.some(
          (field) => field.id === snapshot.selectedFieldId,
        )
          ? snapshot.selectedFieldId
          : null;
        state.lastChange = null;
        state.revision += 1;
      };

      const indexOf = (id: string) => get().schema.fields.findIndex((field) => field.id === id);

      return {
        title: initial.title,
        schema: initial.schema,
        theme: initial.theme ?? createDefaultTheme(),
        selectedFieldId: null,
        past: [],
        future: [],
        lastChange: null,
        revision: 0,
        savedRevision: 0,
        version: initial.version,

        addField: (type, index) => {
          const field = createField(type);
          change((state) => {
            const { fields } = state.schema;
            fields.splice(clamp(index ?? fields.length, 0, fields.length), 0, field);
            state.selectedFieldId = field.id;
          });
          return field.id;
        },

        updateField: (id, patch, options) => {
          const index = indexOf(id);
          const existing = get().schema.fields[index];
          if (!existing) return;
          const entries = Object.entries(patch) as [EditableKey, unknown][];
          const changes = entries.filter(
            ([key, value]) => !isSame(existing[key as keyof Field], value),
          );
          if (changes.length === 0) return;

          change(
            (state) => {
              const field = state.schema.fields[index] as Record<string, unknown> | undefined;
              if (!field) return;
              for (const [key, value] of changes) {
                if (value === undefined) Reflect.deleteProperty(field, key);
                else field[key] = value;
              }
            },
            { ...options, prune: changes.some(([key]) => STRUCTURAL_KEYS.includes(key)) },
          );
        },

        removeField: (id) => {
          const index = indexOf(id);
          if (index < 0) return;
          change(
            (state) => {
              state.schema.fields.splice(index, 1);
              if (state.selectedFieldId === id) state.selectedFieldId = null;
            },
            { prune: true },
          );
        },

        duplicateField: (id) => {
          const index = indexOf(id);
          const source = get().schema.fields[index];
          if (!source) return null;
          const copy = copyField(source);
          change((state) => {
            state.schema.fields.splice(index + 1, 0, copy);
            state.selectedFieldId = copy.id;
          });
          return copy.id;
        },

        moveField: (id, toIndex) => {
          const from = indexOf(id);
          if (from < 0) return;
          const to = clamp(toIndex, 0, get().schema.fields.length - 1);
          if (from === to) return;
          change(
            (state) => {
              const [field] = state.schema.fields.splice(from, 1);
              if (field) state.schema.fields.splice(to, 0, field);
            },
            { prune: true },
          );
        },

        selectField: (id) => {
          set((state) => {
            state.selectedFieldId = id;
            // A new selection ends the current typing burst.
            state.lastChange = null;
          });
        },

        updateSettings: (patch, options) => {
          const settings = get().schema.settings;
          const changed = (Object.keys(patch) as (keyof FormSettings)[]).some(
            (key) => !isSame(settings[key], patch[key]),
          );
          if (!changed) return;
          change((state) => {
            const draft = state.schema.settings as Record<string, unknown>;
            for (const [key, value] of Object.entries(patch) as [string, unknown][]) {
              if (value === undefined) Reflect.deleteProperty(draft, key);
              else draft[key] = value;
            }
          }, options);
        },

        setTitle: (title, options) => {
          if (title === get().title) return;
          change((state) => {
            state.title = title;
          }, options);
        },

        setDescription: (description, options) => {
          if (description === (get().schema.description ?? '')) return;
          change((state) => {
            if (description === '') Reflect.deleteProperty(state.schema, 'description');
            else state.schema.description = description;
          }, options);
        },

        updateTheme: (patch, options) => {
          const theme = get().theme;
          const changed = (Object.keys(patch) as (keyof FormTheme)[]).some(
            (key) => theme[key] !== patch[key],
          );
          if (!changed) return;
          change((state) => {
            const draft = state.theme as Record<string, unknown>;
            for (const [key, value] of Object.entries(patch) as [string, unknown][]) {
              if (value === undefined) Reflect.deleteProperty(draft, key);
              else draft[key] = value;
            }
          }, options);
        },

        undo: () => {
          set((state) => {
            const base = original(state);
            const previous = base.past.at(-1);
            if (!previous) return;
            state.past.pop();
            state.future.push(snapshotOf(base));
            restore(state, previous);
          });
        },

        redo: () => {
          set((state) => {
            const base = original(state);
            const next = base.future.at(-1);
            if (!next) return;
            state.future.pop();
            state.past.push(snapshotOf(base));
            restore(state, next);
          });
        },

        markSaved: (revision, version) => {
          set((state) => {
            state.savedRevision = Math.max(state.savedRevision, revision);
            state.version = version;
          });
        },

        reset: ({ title, schema, version, theme }) => {
          set((state) => {
            state.title = title;
            state.schema = schema;
            state.theme = theme ?? createDefaultTheme();
            state.version = version;
            state.selectedFieldId = null;
            state.past = [];
            state.future = [];
            state.lastChange = null;
            state.revision += 1;
            state.savedRevision = state.revision;
          });
        },
      };
    }),
  );
}
