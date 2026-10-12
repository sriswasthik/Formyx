import {
  createDefaultTheme,
  createDefaultLogic,
  createEmptyForm,
  createField,
  type Field,
  type FormSchema,
  type FormTheme,
} from '@formyx/shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormView } from '../form-view';

const name: Field = {
  ...createField('short_text'),
  id: 'name',
  label: 'Your name',
  required: true,
};
const choice = createField('single_choice');
const pick: Field = { ...choice, id: 'pick', label: 'Pick one' };
const notes: Field = { ...createField('long_text'), id: 'notes', label: 'Anything else?' };

const schema: FormSchema = {
  ...createEmptyForm(),
  fields: [name, pick, notes],
  settings: { ...createEmptyForm().settings, submitButtonText: 'Send' },
  logic: createDefaultLogic('Thanks!'),
};

const base = createDefaultTheme();
const theme: FormTheme = {
  ...base,
  layout: {
    ...base.layout,
    mode: 'conversational',
    progress: { style: 'steps', position: 'top' },
  },
  // No transitions, so each step is in place at once.
  motion: { ...base.motion, pageTransition: 'none' },
};

type Props = ComponentProps<typeof FormView>;

function renderForm(
  onSubmit: Props['onSubmit'] = vi.fn(() => ({ ok: true as const })),
  overrides: Partial<FormTheme> = {},
) {
  render(
    <FormView
      title="Survey"
      schema={schema}
      theme={{ ...theme, ...overrides }}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit };
}

afterEach(() => {
  vi.useRealTimers();
});

async function firstStep() {
  return screen.findByRole('textbox', { name: /Your name/ });
}

describe('the conversational layout', () => {
  it('shows one question at a time, with the title and the step in the progress bar', async () => {
    renderForm();
    await firstStep();
    expect(screen.getByRole('heading', { name: 'Survey' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Pick one' })).not.toBeInTheDocument();
    expect(await screen.findByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      'Question 1 of 3',
    );
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('checks the answer before moving on, then continues on Enter', async () => {
    renderForm();
    const user = userEvent.setup();
    const input = await firstStep();
    input.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('This question is required')).toBeInTheDocument();
    expect(input).toHaveFocus();

    await user.type(input, 'Ada{Enter}');
    const group = await screen.findByRole('group', { name: 'Pick one' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Question 2 of 3');
    // Focus follows to the new question, and the title stays as a heading off screen.
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Survey' })).toBeInTheDocument();
  });

  it('moves on by itself after a click on a single choice, and Back returns', async () => {
    renderForm();
    const user = userEvent.setup();
    await user.type(await firstStep(), 'Ada{Enter}');
    await user.click(await screen.findByRole('radio', { name: 'Option 2' }));
    expect(await screen.findByRole('textbox', { name: 'Anything else?' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    const picked = await screen.findByRole('radio', { name: 'Option 2' });
    expect(picked).toBeChecked();
    expect(picked).toHaveFocus();
  });

  it('waits after arrow keys, which only move between options', async () => {
    renderForm();
    const user = userEvent.setup();
    await user.type(await firstStep(), 'Ada{Enter}');
    const first = await screen.findByRole('radio', { name: 'Option 1' });
    first.focus();
    await user.keyboard('{ArrowDown}');
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(screen.getByRole('group', { name: 'Pick one' })).toBeInTheDocument();
    // Arrow keys stay with the radios; Enter moves on.
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('textbox', { name: 'Anything else?' })).toBeInTheDocument();
  });

  it('leaves Enter to text areas and sends with the last step’s button', async () => {
    const { onSubmit } = renderForm(undefined, {
      layout: { ...theme.layout, autoAdvance: false },
    });
    const user = userEvent.setup();
    await user.type(await firstStep(), 'Ada{Enter}');
    await user.click(await screen.findByRole('radio', { name: 'Option 1' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const notesBox = await screen.findByRole('textbox', { name: 'Anything else?' });
    await user.type(notesBox, 'Line one{Enter}Line two');
    expect(notesBox).toHaveValue('Line one\nLine two');

    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Thanks!')).toBeInTheDocument();
  });

  it('returns to the first question the server turns down', async () => {
    const onSubmit = vi.fn(() => ({
      ok: false as const,
      fieldErrors: { name: 'That name is taken' },
    }));
    renderForm(onSubmit);
    const user = userEvent.setup();
    await user.type(await firstStep(), 'Ada{Enter}');
    await user.click(await screen.findByRole('radio', { name: 'Option 1' }));
    await screen.findByRole('textbox', { name: 'Anything else?' });
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(await screen.findByText('That name is taken')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Your name/ })).toHaveFocus();
  });
});
