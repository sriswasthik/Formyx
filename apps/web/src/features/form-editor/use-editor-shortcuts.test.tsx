import { createField, type Field } from '@formyx/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EditorLayout } from './editor-layout';
import { makeFormDetail, renderWithEditor } from './test-utils';

// jsdom reports no platform, so the modifier is Ctrl, as on Windows and Linux.

const first = { ...createField('short_text'), label: 'First' };
const second = { ...createField('email'), label: 'Second' };

function renderEditor(fields: Field[] = [first, second]) {
  const form = makeFormDetail(fields);
  const result = renderWithEditor(<EditorLayout form={form} status={null} />, form);
  return {
    ...result,
    labels: () => result.store.getState().schema.fields.map((field) => field.label),
    selectQuestion: (name: RegExp) =>
      result.user.click(
        within(screen.getByRole('list', { name: 'Questions' })).getByRole('button', { name }),
      ),
  };
}

describe('editor keyboard shortcuts', () => {
  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z or Ctrl+Y', async () => {
    const { user, labels, selectQuestion } = renderEditor();
    await selectQuestion(/First/);
    await user.keyboard('{Delete}');
    expect(labels()).toEqual(['Second']);

    await user.keyboard('{Control>}z{/Control}');
    expect(labels()).toEqual(['First', 'Second']);

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(labels()).toEqual(['Second']);

    await user.keyboard('{Control>}z{/Control}{Control>}y{/Control}');
    expect(labels()).toEqual(['Second']);
  });

  it('undoes the editor, not the browser, while typing in an input', async () => {
    const { user, store, selectQuestion } = renderEditor();
    await selectQuestion(/First/);
    const label = screen.getByRole('textbox', { name: 'Question' });

    await user.type(label, ' question');
    expect(label).toHaveValue('First question');

    await user.keyboard('{Control>}z{/Control}');
    expect(label).toHaveValue('First');
    expect(store.getState().schema.fields[0]?.label).toBe('First');
  });

  it('deletes the selected question with Delete or Backspace, and focuses the next one', async () => {
    const { user, labels, selectQuestion } = renderEditor([first, second, createField('date')]);

    await selectQuestion(/First/);
    await user.keyboard('{Backspace}');
    expect(labels()).toEqual(['Second', '']);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Question 1: Second/ })).toHaveFocus();
    });

    await selectQuestion(/Second/);
    await user.keyboard('{Delete}');
    expect(labels()).toEqual(['']);
  });

  it('never deletes a question while typing', async () => {
    const { user, labels, selectQuestion } = renderEditor();
    await selectQuestion(/First/);

    await user.click(screen.getByRole('textbox', { name: 'Question' }));
    await user.keyboard('{Backspace}{Delete}');

    expect(labels()).toEqual(['Firs', 'Second']);
  });

  it('duplicates the selected question with Ctrl+D', async () => {
    const { user, labels, selectQuestion } = renderEditor();
    await selectQuestion(/Second/);

    await user.keyboard('{Control>}d{/Control}');

    expect(labels()).toEqual(['First', 'Second', 'Second']);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Question 3: Second/ })).toHaveFocus();
    });
  });

  it('deselects with Escape, leaving an input first', async () => {
    const { user, store, selectQuestion } = renderEditor();
    await selectQuestion(/First/);
    await user.click(screen.getByRole('textbox', { name: 'Question' }));

    await user.keyboard('{Escape}');
    expect(store.getState().selectedFieldId).toBe(first.id);
    expect(screen.getByRole('textbox', { name: 'Question' })).not.toHaveFocus();

    await user.keyboard('{Escape}');
    expect(store.getState().selectedFieldId).toBeNull();
    expect(screen.getByRole('heading', { name: 'Form settings' })).toBeInTheDocument();
  });

  it('is off in preview', async () => {
    const { user, labels, selectQuestion } = renderEditor();
    await selectQuestion(/First/);
    await user.click(screen.getByRole('radio', { name: 'Preview' }));

    await user.keyboard('{Delete}{Control>}d{/Control}');

    expect(labels()).toEqual(['First', 'Second']);
  });

  it('shows shortcuts in tooltips', async () => {
    const { user } = renderEditor();

    await user.hover(screen.getByRole('button', { name: 'Undo' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('UndoCtrl+Z');
  });
});
