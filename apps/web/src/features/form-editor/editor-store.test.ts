import { createEmptyForm, createField, type Field, type FormSchema } from '@formyx/shared';
import { describe, expect, it, vi } from 'vitest';
import { createEditorStore, MAX_HISTORY, MERGE_WINDOW_MS } from './editor-store';

function setup(fields: Field[] = []) {
  let time = 1_000_000;
  const onConditionsRemoved = vi.fn();
  const schema: FormSchema = { ...createEmptyForm(), fields };
  const store = createEditorStore(
    { title: 'Survey', schema, version: 4 },
    { onConditionsRemoved, now: () => time },
  );
  return {
    store,
    state: () => store.getState(),
    ids: () => store.getState().schema.fields.map((field) => field.id),
    advance: (ms: number) => {
      time += ms;
    },
    onConditionsRemoved,
  };
}

const named = (label: string, type: Field['type'] = 'short_text'): Field => ({
  ...createField(type),
  label,
});

describe('initial state', () => {
  it('starts from the given form with nothing selected and no history', () => {
    const { state } = setup([named('A')]);
    expect(state()).toMatchObject({
      title: 'Survey',
      selectedFieldId: null,
      past: [],
      future: [],
      revision: 0,
      savedRevision: 0,
      version: 4,
    });
  });
});

describe('addField', () => {
  it('appends a new question by default and selects it', () => {
    const { store, state } = setup([named('A')]);

    const id = store.getState().addField('email');

    expect(state().schema.fields).toHaveLength(2);
    expect(state().schema.fields[1]).toMatchObject({
      id,
      type: 'email',
      label: '',
      required: false,
    });
    expect(state().selectedFieldId).toBe(id);
  });

  it('inserts at an index, clamping out-of-range ones', () => {
    const a = named('A');
    const b = named('B');
    const { store, ids } = setup([a, b]);

    const middle = store.getState().addField('number', 1);
    const first = store.getState().addField('date', -5);
    const last = store.getState().addField('rating', 99);

    expect(ids()).toEqual([first, a.id, middle, b.id, last]);
  });

  it('can be undone and redone', () => {
    const { store, state, ids } = setup();
    const id = store.getState().addField('phone');

    store.getState().undo();
    expect(ids()).toEqual([]);
    expect(state().selectedFieldId).toBeNull();

    store.getState().redo();
    expect(ids()).toEqual([id]);
    expect(state().selectedFieldId).toBe(id);
  });
});

describe('updateField', () => {
  it('changes properties and removes ones set to undefined', () => {
    const field = { ...named('Name'), placeholder: 'Ada' };
    const { store, state } = setup([field]);

    store
      .getState()
      .updateField(field.id, { label: 'Full name', placeholder: undefined, required: true });

    expect(state().schema.fields[0]).toEqual({
      id: field.id,
      type: 'short_text',
      label: 'Full name',
      required: true,
    });
  });

  it('ignores unknown questions and changes that change nothing', () => {
    const field = named('Name');
    const { store, state } = setup([field]);

    store.getState().updateField('fld_missing', { label: 'X' });
    store.getState().updateField(field.id, { label: 'Name' });
    store.getState().updateField(field.id, {});

    expect(state().past).toHaveLength(0);
    expect(state().revision).toBe(0);
  });

  it('merges rapid typing in one input into a single undo step', () => {
    const field = named('');
    const { store, state, advance } = setup([field]);
    const type = (label: string) => {
      store.getState().updateField(field.id, { label }, { mergeKey: `label:${field.id}` });
      advance(150);
    };

    for (const label of ['H', 'He', 'Hel', 'Hell', 'Hello']) type(label);

    expect(state().past).toHaveLength(1);
    store.getState().undo();
    expect(state().schema.fields[0]?.label).toBe('');
  });

  it('starts a new step after a pause, in another input, or after selecting', () => {
    const field = named('');
    const { store, state, advance } = setup([field]);
    const labelKey = { mergeKey: `label:${field.id}` };

    store.getState().updateField(field.id, { label: 'One' }, labelKey);
    advance(MERGE_WINDOW_MS + 1);
    store.getState().updateField(field.id, { label: 'One two' }, labelKey);
    expect(state().past).toHaveLength(2);

    store
      .getState()
      .updateField(field.id, { description: 'Hint' }, { mergeKey: `description:${field.id}` });
    expect(state().past).toHaveLength(3);

    store.getState().selectField(field.id);
    store
      .getState()
      .updateField(field.id, { description: 'Hint!' }, { mergeKey: `description:${field.id}` });
    expect(state().past).toHaveLength(4);
  });

  it('never merges changes without a merge key', () => {
    const field = named('');
    const { store, state } = setup([field]);

    store.getState().updateField(field.id, { required: true });
    store.getState().updateField(field.id, { required: false });

    expect(state().past).toHaveLength(2);
  });

  it('drops conditions that point at a deleted option', () => {
    const choice = createField('single_choice');
    const followUp: Field = {
      ...named('Why?'),
      conditions: [
        { sourceFieldId: choice.id, operator: 'equals', value: choice.options[0]?.id ?? '' },
      ],
    };
    const { store, state, onConditionsRemoved } = setup([choice, followUp]);

    store.getState().updateField(choice.id, { options: choice.options.slice(1) });

    expect(state().schema.fields[1]).not.toHaveProperty('conditions');
    expect(onConditionsRemoved).toHaveBeenCalledWith(1, expect.any(Function));
  });
});

describe('removeField', () => {
  it('removes the question and clears the selection if it was selected', () => {
    const [a, b] = [named('A'), named('B')];
    const { store, state, ids } = setup([a, b]);

    store.getState().selectField(a.id);
    store.getState().removeField(b.id);
    expect(ids()).toEqual([a.id]);
    expect(state().selectedFieldId).toBe(a.id);

    store.getState().removeField(a.id);
    expect(ids()).toEqual([]);
    expect(state().selectedFieldId).toBeNull();
  });

  it('ignores unknown questions', () => {
    const { store, state } = setup([named('A')]);
    store.getState().removeField('fld_missing');
    expect(state().past).toHaveLength(0);
  });

  it('drops conditions that depended on it, and undo brings both back', () => {
    const source = named('Source');
    const dependent: Field = {
      ...named('Dependent'),
      conditions: [{ sourceFieldId: source.id, operator: 'is_answered' }],
    };
    const { store, state, onConditionsRemoved } = setup([source, dependent]);

    store.getState().removeField(source.id);
    expect(state().schema.fields[0]).not.toHaveProperty('conditions');
    expect(onConditionsRemoved).toHaveBeenCalledWith(1, expect.any(Function));

    store.getState().undo();
    expect(state().schema.fields[1]?.conditions).toEqual(dependent.conditions);
  });
});

describe('duplicateField', () => {
  it('copies the question right below it with new ids, and selects the copy', () => {
    const choice = { ...createField('multi_choice'), label: 'Pick', required: true };
    const other = named('Other');
    const { store, state, ids } = setup([choice, other]);

    const copyId = store.getState().duplicateField(choice.id);

    expect(ids()).toEqual([choice.id, copyId, other.id]);
    const copy = state().schema.fields[1];
    expect(copy).toMatchObject({ type: 'multi_choice', label: 'Pick', required: true });
    expect(copy?.id).not.toBe(choice.id);
    const optionIds = copy && 'options' in copy ? copy.options.map((option) => option.id) : [];
    expect(optionIds).toHaveLength(2);
    expect(optionIds.some((id) => choice.options.some((option) => option.id === id))).toBe(false);
    expect(state().selectedFieldId).toBe(copyId);
  });

  it('returns null for unknown questions', () => {
    const { store } = setup();
    expect(store.getState().duplicateField('fld_missing')).toBeNull();
  });
});

describe('moveField', () => {
  const a = named('A');
  const b = named('B');
  const c = named('C');
  const d = named('D');

  it('moves a question down or up to the given index', () => {
    const { store, ids } = setup([a, b, c, d]);

    store.getState().moveField(a.id, 2);
    expect(ids()).toEqual([b.id, c.id, a.id, d.id]);

    store.getState().moveField(d.id, 0);
    expect(ids()).toEqual([d.id, b.id, c.id, a.id]);
  });

  it('clamps the index to the list', () => {
    const { store, ids } = setup([a, b, c]);

    store.getState().moveField(a.id, 10);
    expect(ids()).toEqual([b.id, c.id, a.id]);

    store.getState().moveField(a.id, -3);
    expect(ids()).toEqual([a.id, b.id, c.id]);
  });

  it('records nothing when the question stays where it is or does not exist', () => {
    const { store, state } = setup([a, b]);

    store.getState().moveField(a.id, 0);
    store.getState().moveField(b.id, 5);
    store.getState().moveField('fld_missing', 0);

    expect(state().past).toHaveLength(0);
  });

  it('keeps the selection on the moved question', () => {
    const { store, state } = setup([a, b, c]);
    store.getState().selectField(b.id);
    store.getState().moveField(b.id, 2);
    expect(state().selectedFieldId).toBe(b.id);
  });

  it('drops conditions it breaks, and undo restores order and conditions', () => {
    const dependent: Field = {
      ...named('Why?'),
      conditions: [{ sourceFieldId: a.id, operator: 'is_answered' }],
    };
    const { store, state, ids, onConditionsRemoved } = setup([a, dependent]);

    store.getState().moveField(dependent.id, 0);
    expect(state().schema.fields[0]).not.toHaveProperty('conditions');
    expect(onConditionsRemoved).toHaveBeenCalledWith(1, expect.any(Function));

    store.getState().undo();
    expect(ids()).toEqual([a.id, dependent.id]);
    expect(state().schema.fields[1]?.conditions).toHaveLength(1);
  });
});

describe('selectField', () => {
  it('changes the selection without touching history or the revision', () => {
    const field = named('A');
    const { store, state } = setup([field]);

    store.getState().selectField(field.id);
    expect(state().selectedFieldId).toBe(field.id);
    store.getState().selectField(null);

    expect(state().selectedFieldId).toBeNull();
    expect(state().past).toHaveLength(0);
    expect(state().revision).toBe(0);
  });
});

describe('updateSettings and setTitle', () => {
  it('are undoable and merge typing', () => {
    const { store, state } = setup();

    store.getState().updateSettings({ submitButtonText: 'S' }, { mergeKey: 'submit' });
    store.getState().updateSettings({ submitButtonText: 'Se' }, { mergeKey: 'submit' });
    store.getState().setTitle('Survey 2026', { mergeKey: 'title' });

    expect(state().schema.settings.submitButtonText).toBe('Se');
    expect(state().past).toHaveLength(2);

    store.getState().undo();
    expect(state().title).toBe('Survey');
    store.getState().undo();
    expect(state().schema.settings.submitButtonText).toBe('Submit');
  });

  it('ignore changes that change nothing', () => {
    const { store, state } = setup();
    store.getState().setTitle('Survey');
    store.getState().updateSettings({ submitButtonText: 'Submit' });
    expect(state().past).toHaveLength(0);
  });
});

describe('undo and redo', () => {
  it('do nothing when there is nothing to undo or redo', () => {
    const { store, state } = setup([named('A')]);
    const before = state();

    store.getState().undo();
    store.getState().redo();

    expect(state().schema).toBe(before.schema);
    expect(state().revision).toBe(0);
  });

  it('step back and forth through several changes', () => {
    const { store, state, ids } = setup();
    const first = store.getState().addField('email');
    const second = store.getState().addField('phone');
    store.getState().setTitle('Contact');

    store.getState().undo();
    store.getState().undo();
    expect(ids()).toEqual([first]);
    expect(state().title).toBe('Survey');
    expect(state().future).toHaveLength(2);

    store.getState().redo();
    store.getState().redo();
    expect(ids()).toEqual([first, second]);
    expect(state().title).toBe('Contact');
    expect(state().future).toHaveLength(0);
  });

  it('forget the redo stack after a new change', () => {
    const { store, state } = setup();
    store.getState().addField('email');
    store.getState().undo();

    store.getState().addField('date');

    expect(state().future).toEqual([]);
    store.getState().redo();
    expect(state().schema.fields.map((field) => field.type)).toEqual(['date']);
  });

  it('restore the selection from before the change', () => {
    const field = named('A');
    const { store, state } = setup([field]);
    store.getState().selectField(field.id);

    store.getState().removeField(field.id);
    expect(state().selectedFieldId).toBeNull();

    store.getState().undo();
    expect(state().selectedFieldId).toBe(field.id);
  });

  it('drop a restored selection whose question does not exist in that state', () => {
    const { store, state } = setup();
    const id = store.getState().addField('email');
    store.getState().selectField(id);
    store.getState().setTitle('New title');

    store.getState().undo();
    store.getState().undo();

    expect(state().schema.fields).toEqual([]);
    expect(state().selectedFieldId).toBeNull();
  });

  it(`keep at most ${MAX_HISTORY} steps`, () => {
    const { store, state } = setup();
    for (let i = 0; i < MAX_HISTORY + 5; i++) store.getState().setTitle(`Title ${i}`);

    expect(state().past).toHaveLength(MAX_HISTORY);
    for (let i = 0; i < MAX_HISTORY + 5; i++) store.getState().undo();

    // The five oldest steps are gone, so undo stops at "Title 4".
    expect(state().title).toBe('Title 4');
    expect(state().future).toHaveLength(MAX_HISTORY);
  });

  it('count as changes for saving', () => {
    const { store, state } = setup();
    store.getState().setTitle('A');
    store.getState().undo();
    store.getState().redo();
    expect(state().revision).toBe(3);
  });
});

describe('saving', () => {
  it('tracks the saved revision and server version', () => {
    const { store, state } = setup();
    store.getState().setTitle('A');
    store.getState().setTitle('B');

    store.getState().markSaved(1, 5);
    expect(state()).toMatchObject({ savedRevision: 1, version: 5, revision: 2 });

    // A late answer for an older save never moves the saved revision backwards.
    store.getState().markSaved(0, 5);
    expect(state().savedRevision).toBe(1);
  });

  it('reset replaces everything with the server copy and clears history', () => {
    const { store, state } = setup([named('A')]);
    store.getState().addField('email');
    store.getState().undo();

    const latest = { ...createEmptyForm(), fields: [named('Theirs')] };
    store.getState().reset({ title: 'Their title', schema: latest, version: 9 });

    expect(state()).toMatchObject({
      title: 'Their title',
      schema: latest,
      version: 9,
      selectedFieldId: null,
      past: [],
      future: [],
    });
    expect(state().savedRevision).toBe(state().revision);
  });
});
