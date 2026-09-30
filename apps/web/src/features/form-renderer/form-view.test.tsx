import {
  createDefaultTheme,
  createEmptyForm,
  createField,
  type Answers,
  type Field,
  type FormSchema,
} from '@formyx/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FormView } from './form-view';

const contact = createField('single_choice');
const [yes, no] = contact.options;
const email: Field = {
  ...createField('email'),
  label: 'Your email',
  required: true,
  conditions: [{ sourceFieldId: contact.id, operator: 'equals', value: yes?.id ?? '' }],
};
const name: Field = { ...createField('short_text'), label: 'Name', required: true };

const schema: FormSchema = {
  ...createEmptyForm(),
  fields: [name, { ...contact, label: 'May we contact you?' }, email],
  settings: {
    submitButtonText: 'Send',
    successMessage: 'Thanks, we got it.',
    notifyOnSubmit: false,
  },
};

function renderForm(onSubmit?: (answers: Answers) => void) {
  render(
    <FormView title="Feedback" schema={schema} theme={createDefaultTheme()} onSubmit={onSubmit} />,
  );
  return userEvent.setup();
}

describe('FormView', () => {
  it('shows the title, the questions and the submit button text', () => {
    renderForm();
    expect(screen.getByRole('heading', { level: 1, name: 'Feedback' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Name/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('shows follow-up questions only when their conditions hold', async () => {
    const user = renderForm();
    expect(screen.queryByRole('textbox', { name: /Your email/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: yes?.label ?? '' }));
    expect(await screen.findByRole('textbox', { name: /Your email/ })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: no?.label ?? '' }));
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /Your email/ })).not.toBeInTheDocument();
    });
  });

  it('checks answers on submit, focuses the first problem and clears errors as they are fixed', async () => {
    const onSubmit = vi.fn();
    const user = renderForm(onSubmit);

    await user.click(screen.getByRole('button', { name: 'Send' }));

    const nameInput = screen.getByRole('textbox', { name: /Name/ });
    expect(nameInput).toHaveFocus();
    expect(nameInput).toHaveAccessibleDescription('This question is required');
    expect(screen.getByRole('alert')).toHaveTextContent('1 question needs your attention.');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(nameInput, 'Ada');
    expect(nameInput).not.toHaveAttribute('aria-invalid');
  });

  it('submits the answers to visible questions and thanks the respondent', async () => {
    const onSubmit = vi.fn();
    const user = renderForm(onSubmit);

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Ada');
    await user.click(screen.getByRole('radio', { name: yes?.label ?? '' }));
    await user.type(await screen.findByRole('textbox', { name: /Your email/ }), 'ada@example.com');
    // Changing the answer hides the email question; its answer must not be sent.
    await user.click(screen.getByRole('radio', { name: no?.label ?? '' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Thanks, we got it.')).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith({ [name.id]: 'Ada', [contact.id]: no?.id });

    await user.click(screen.getByRole('button', { name: 'Submit another response' }));
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('');
  });
});
