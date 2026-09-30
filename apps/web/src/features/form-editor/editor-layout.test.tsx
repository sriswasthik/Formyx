import { createField, type Field } from '@formyx/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EditorLayout } from './editor-layout';
import { makeFormDetail, renderWithEditor } from './test-utils';

function renderEditor(fields: Field[] = [createField('short_text')]) {
  const form = makeFormDetail(fields);
  return renderWithEditor(<EditorLayout form={form} status={null} />, form);
}

const canvas = () => screen.getByRole('list', { name: 'Questions' });
const questions = () => within(canvas()).queryAllByRole('listitem');

describe('EditorLayout', () => {
  it('shows the palette grouped by category, the canvas and form settings', () => {
    renderEditor([]);

    const palette = screen.getByRole('navigation', { name: 'Question types' });
    expect(within(palette).getByRole('heading', { name: 'Text' })).toBeInTheDocument();
    expect(within(palette).getByRole('heading', { name: 'Choice' })).toBeInTheDocument();
    expect(within(palette).getByRole('heading', { name: 'Other' })).toBeInTheDocument();
    expect(within(palette).getAllByRole('button')).toHaveLength(12);

    expect(screen.getByText('This form has no questions yet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Form settings' })).toBeInTheDocument();
  });

  it('adds a question from the palette to the canvas, selected and ready to edit', async () => {
    const { user, store } = renderEditor([]);

    await user.click(screen.getByRole('button', { name: 'Add email' }));

    expect(questions()).toHaveLength(1);
    const question = within(canvas()).getByRole('button', {
      name: /Question 1: Untitled question, Email/,
    });
    expect(question).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('toolbar', { name: 'Question actions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Email' })).toBeInTheDocument();
    expect(store.getState().schema.fields.map((field) => field.type)).toEqual(['email']);
    await waitFor(() => {
      expect(question).toHaveFocus();
    });
  });

  it('appends further questions at the end', async () => {
    const { user } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Add rating' }));
    await user.click(screen.getByRole('button', { name: 'Add date' }));

    const names = within(canvas())
      .getAllByRole('button', { name: /^Question \d/ })
      .map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual([
      'Question 1: Untitled question, Short text',
      'Question 2: Untitled question, Rating',
      'Question 3: Untitled question, Date',
    ]);
  });

  it('updates the canvas as the question is edited in the settings panel', async () => {
    const { user } = renderEditor();

    await user.click(within(canvas()).getByRole('button', { name: /Question 1/ }));
    await user.type(screen.getByRole('textbox', { name: 'Question' }), 'Your name');
    await user.click(screen.getByRole('switch', { name: 'Required' }));

    expect(within(canvas()).getByText('Your name')).toBeInTheDocument();
    expect(
      within(canvas()).getByRole('button', { name: 'Question 1: Your name, Short text' }),
    ).toBeInTheDocument();
    expect(within(canvas()).getByText('(required)')).toBeInTheDocument();
  });

  it('moves, duplicates and deletes the selected question from its toolbar', async () => {
    const first = { ...createField('short_text'), label: 'First' };
    const second = { ...createField('email'), label: 'Second' };
    const { user, store } = renderEditor([first, second]);
    const labels = () => store.getState().schema.fields.map((field) => field.label);

    await user.click(within(canvas()).getByRole('button', { name: /Question 1: First/ }));
    const toolbar = screen.getByRole('toolbar', { name: 'Question actions' });
    expect(within(toolbar).getByRole('button', { name: 'Move up' })).toBeDisabled();

    await user.click(within(toolbar).getByRole('button', { name: 'Move down' }));
    expect(labels()).toEqual(['Second', 'First']);

    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(labels()).toEqual(['Second', 'First', 'First']);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(labels()).toEqual(['Second', 'First']);
  });

  it('shows form settings again when the canvas background is clicked', async () => {
    const { user, container } = renderEditor();

    await user.click(within(canvas()).getByRole('button', { name: /Question 1/ }));
    expect(screen.queryByRole('heading', { name: 'Form settings' })).not.toBeInTheDocument();

    const background = container.querySelector('[data-editor-canvas]');
    if (!background) throw new Error('canvas missing');
    await user.pointer({ keys: '[MouseLeft]', target: background });

    expect(screen.getByRole('heading', { name: 'Form settings' })).toBeInTheDocument();
  });

  it('edits the submit button text from form settings', async () => {
    const { user } = renderEditor();
    const input = screen.getByRole('textbox', { name: 'Button text' });

    await user.clear(input);
    await user.type(input, 'Send it');

    expect(screen.getByText('Send it')).toBeInTheDocument();
  });

  it('edits the description and response limits from form settings', async () => {
    const { user, store } = renderEditor();

    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Tell us how we did');
    await user.type(screen.getByRole('textbox', { name: 'Response limit' }), '100');

    expect(screen.getByText('Tell us how we did', { selector: 'p' })).toBeInTheDocument();
    expect(store.getState().schema).toMatchObject({
      description: 'Tell us how we did',
      settings: { closeAfterResponses: 100 },
    });
  });

  it('undoes and redoes from the top bar', async () => {
    const { user } = renderEditor([]);
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Add phone number' }));
    expect(questions()).toHaveLength(1);

    await user.click(undo);
    await waitFor(() => {
      expect(questions()).toHaveLength(0);
    });
    expect(redo).toBeEnabled();

    await user.click(redo);
    expect(questions()).toHaveLength(1);
  });

  it('renames the form in place', async () => {
    const { user, store } = renderEditor();
    const title = screen.getByRole('textbox', { name: 'Form title' });

    await user.clear(title);
    await user.type(title, 'Onboarding{Enter}');
    expect(store.getState().title).toBe('Onboarding');
    expect(screen.getByRole('heading', { level: 2, name: 'Onboarding' })).toBeInTheDocument();

    await user.clear(title);
    await user.tab();
    expect(store.getState().title).toBe('Untitled form');
  });

  it('previews the form with working inputs', async () => {
    const { user } = renderEditor([{ ...createField('short_text'), label: 'Name' }]);

    await user.click(screen.getByRole('radio', { name: 'Preview' }));

    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.type(input, 'Ada');
    expect(input).toHaveValue('Ada');
    expect(screen.queryByRole('navigation', { name: 'Question types' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Build' }));
    expect(screen.getByRole('navigation', { name: 'Question types' })).toBeInTheDocument();
  });

  it('says answers are not saved in preview, and restarts with an empty form', async () => {
    const { user } = renderEditor([{ ...createField('short_text'), label: 'Name' }]);
    await user.click(screen.getByRole('radio', { name: 'Preview' }));

    expect(screen.getByText(/Answers are not saved/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Restart' }));

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('');
  });
});
