import {
  createDefaultTheme,
  createEmptyForm,
  createEndScreen,
  createField,
  createJump,
  type Field,
  type FormSchema,
} from '@formyx/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormView, type SubmitOutcome } from './form-view';

/*
 * Page 1 asks a name and whether they own a pet; "No" ends the form on the "No pet" end
 * screen. Page 2 asks the pet's name, greeting them by the name they gave.
 */
const name = { ...createField('short_text'), id: 'name', label: 'Your name', required: true };
const pet: Field = {
  ...createField('yes_no'),
  id: 'pet',
  label: 'Do you have a pet?',
  required: true,
};
const petPage = { ...createField('page_break'), id: 'pets', label: 'About your pet' };
const petName = {
  ...createField('short_text'),
  id: 'pet_name',
  label: "What's your pet called, {{field:name}}?",
};

const base = createEmptyForm();
const schema: FormSchema = {
  ...base,
  fields: [name, pet, petPage, petName],
  settings: { ...base.settings, submitButtonText: 'Send' },
  logic: {
    ...base.logic,
    pages: {
      start: {
        jumps: [
          {
            ...createJump({ kind: 'end', endScreenId: 'no_pet' }),
            when: [{ kind: 'answer', sourceFieldId: 'pet', operator: 'equals', value: 'no' }],
          },
        ],
      },
    },
    endScreens: [
      createEndScreen({ id: 'end_default', message: 'Thanks, {{field:name}}!' }),
      createEndScreen({
        id: 'no_pet',
        title: 'No pet, no problem',
        message: 'Bye {{field:name}}.',
      }),
    ],
  },
};

function renderForm(props: Partial<React.ComponentProps<typeof FormView>> = {}) {
  const view = render(
    <FormView title="Pets" schema={schema} theme={createDefaultTheme()} {...props} />,
  );
  return { ...view, user: userEvent.setup() };
}

afterEach(() => {
  localStorage.clear();
});

describe('FormView with logic', () => {
  it('jumps to an end screen, worked out in the browser when nobody else says', async () => {
    const { user } = renderForm();
    await user.type(screen.getByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.click(screen.getByText('No'));

    // The jump ends the form here, so this page sends it.
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('heading', { name: 'No pet, no problem' })).toBeInTheDocument();
    expect(screen.getByText('Bye Ada.')).toBeInTheDocument();
  });

  it('goes on to the next page otherwise, with the answer piped in', async () => {
    const { user } = renderForm();
    await user.type(screen.getByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.click(screen.getByText('Yes'));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('heading', { name: 'About your pet' })).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: "What's your pet called, Ada?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Thanks, Ada!')).toBeInTheDocument();
  });

  it('shows the end screen and score the server sends', async () => {
    const quizzed: FormSchema = {
      ...schema,
      logic: {
        ...schema.logic,
        endScreens: [
          ...schema.logic.endScreens,
          createEndScreen({ id: 'scored', message: '{{var:quiz_score}} points', showScore: true }),
        ],
      },
    };
    const onSubmit = vi.fn<() => SubmitOutcome>(() => ({
      ok: true,
      outcome: {
        endScreenId: 'scored',
        values: { quiz_score: 3, quiz_percent: 75 },
        quiz: {
          score: 3,
          max: 4,
          percent: 75,
          passed: true,
          review: [
            { fieldId: 'pet', correct: false, answered: true, points: 1, expected: ['yes'] },
          ],
        },
      },
    }));
    const { user } = renderForm({ schema: quizzed, onSubmit });
    await user.type(screen.getByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.click(screen.getByText('No'));
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('3 points')).toBeInTheDocument();
    expect(screen.getByText('3 out of 4')).toBeInTheDocument();
    expect(screen.getByText('You passed.')).toBeInTheDocument();
    const review = screen.getByRole('region', { name: 'Your answers' });
    expect(review).toHaveTextContent('Do you have a pet?');
    expect(review).toHaveTextContent('Your answer: No');
    expect(review).toHaveTextContent('Right answer: Yes');
  });

  it('keeps answers in the browser, and offers to start over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const first = renderForm({ saveProgressKey: 'pets' });
      await first.user.type(screen.getByRole('textbox', { name: /Your name/ }), 'Ada');
      await act(() => vi.advanceTimersByTimeAsync(500));
      first.unmount();

      const second = renderForm({ saveProgressKey: 'pets' });
      expect(screen.getByRole('textbox', { name: /Your name/ })).toHaveValue('Ada');
      expect(screen.getByText(/Welcome back/)).toBeInTheDocument();

      await second.user.click(screen.getByRole('button', { name: 'Start over' }));
      expect(screen.getByRole('textbox', { name: /Your name/ })).toHaveValue('');
      expect(localStorage.getItem('formyx:progress:pets')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the latest answers when the page goes away before the save', () => {
    renderForm({ saveProgressKey: 'pets-unload' });
    fireEvent.change(screen.getByRole('textbox', { name: /Your name/ }), {
      target: { value: 'Ada' },
    });
    expect(localStorage.getItem('formyx:progress:pets-unload')).toBeNull();

    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    expect(localStorage.getItem('formyx:progress:pets-unload')).toContain('"Ada"');
  });

  it('keeps the answers in the browser until the server has them', async () => {
    const onSubmit = vi
      .fn<() => Promise<SubmitOutcome>>()
      .mockResolvedValueOnce({ ok: false, message: 'Your answers could not be sent.' })
      .mockResolvedValue({ ok: true });
    const { user } = renderForm({ saveProgressKey: 'pets-send', onSubmit });
    await user.type(screen.getByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.click(screen.getByText('No'));
    await waitFor(() => {
      expect(localStorage.getItem('formyx:progress:pets-send')).toContain('"Ada"');
    });

    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Your answers could not be sent.')).toBeInTheDocument();
    expect(localStorage.getItem('formyx:progress:pets-send')).toContain('"Ada"');

    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('heading', { name: 'No pet, no problem' })).toBeInTheDocument();
    expect(localStorage.getItem('formyx:progress:pets-send')).toBeNull();
  });

  it('emails a link to finish later when the form offers it', async () => {
    const offering: FormSchema = {
      ...schema,
      settings: { ...schema.settings, saveProgress: 'email' },
    };
    const onSaveDraft = vi.fn(() => Promise.resolve());
    const { user } = renderForm({ schema: offering, onSaveDraft });
    await user.type(screen.getByRole('textbox', { name: /Your name/ }), 'Ada');

    await user.click(await screen.findByRole('button', { name: 'Save and continue later' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Email me a link to finish later' }),
      'ada@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Send link' }));

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledWith({
        email: 'ada@example.com',
        answers: { name: 'Ada' },
        state: { pageKey: 'start', seed: expect.any(String) as string },
      });
    });
    expect(await screen.findByText(/We sent a link to ada@example.com/)).toBeInTheDocument();
  });

  it('carries on from a saved draft on its page', () => {
    renderForm({
      resume: { answers: { name: 'Ada', pet: 'yes' }, state: { pageKey: 'pets', seed: 'abc' } },
    });
    expect(screen.getByRole('heading', { name: 'About your pet' })).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: "What's your pet called, Ada?" }),
    ).toBeInTheDocument();
  });

  it('reports how far the respondent got', async () => {
    const onProgress = vi.fn();
    const { user } = renderForm({ onProgress });
    await user.type(screen.getByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.click(screen.getByText('Yes'));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onProgress).toHaveBeenCalledWith({ pageKey: 'start' });
    expect(onProgress).toHaveBeenCalledWith({ fieldId: 'pet' });
    expect(onProgress).toHaveBeenCalledWith({ pageKey: 'pets' });
  });
});
