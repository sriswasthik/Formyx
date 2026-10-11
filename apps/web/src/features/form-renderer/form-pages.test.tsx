import {
  createDefaultTheme,
  createDefaultLogic,
  createEmptyForm,
  createField,
  type Field,
  type FormSchema,
  type SubmittedAnswers,
} from '@formyx/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FormView, type SubmitOutcome } from './form-view';

const name: Field = { ...createField('short_text'), label: 'Name', required: true };
const pageTwo: Field = {
  ...createField('page_break'),
  label: 'About your visit',
  description: 'A few more questions.',
};
const visit: Field = { ...createField('long_text'), label: 'How was it?', required: true };
const source: Field = { ...createField('hidden'), label: 'Source', paramName: 'source' };

const schema: FormSchema = {
  ...createEmptyForm(),
  fields: [source, name, pageTwo, visit],
  settings: { ...createEmptyForm().settings, submitButtonText: 'Send' },
  logic: createDefaultLogic('Thanks.'),
};

function renderForm(linkParams?: URLSearchParams) {
  const onSubmit = vi.fn<(answers: SubmittedAnswers) => SubmitOutcome>(() => ({ ok: true }));
  render(
    <FormView
      title="Visit"
      schema={schema}
      theme={createDefaultTheme()}
      onSubmit={onSubmit}
      linkParams={linkParams}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe('FormView with page breaks', () => {
  it('shows one page at a time and checks each page before the next', async () => {
    const { user } = renderForm();

    expect(screen.getByRole('textbox', { name: /Name/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /How was it/ })).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveFocus();
    expect(screen.getByText('This question is required')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('heading', { level: 2, name: 'About your visit' })).toBeInTheDocument();
    expect(screen.getByText('A few more questions.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /How was it/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Name/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('goes back with answers kept', async () => {
    const { user } = renderForm();
    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('Ada');
  });

  it('sends every page and hidden fields filled from the link', async () => {
    const { user, onSubmit } = renderForm(new URLSearchParams('source=newsletter&x=1'));
    // Hidden fields are never drawn.
    expect(screen.queryByText('Source')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(screen.getByRole('textbox', { name: /How was it/ }), 'Lovely');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith({
      [source.id]: 'newsletter',
      [name.id]: 'Ada',
      [visit.id]: 'Lovely',
    });
    expect(await screen.findByText('Thanks.')).toBeInTheDocument();
  });

  it('leaves a hidden field out when the link does not carry it', async () => {
    const { user, onSubmit } = renderForm(new URLSearchParams('other=1'));
    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(screen.getByRole('textbox', { name: /How was it/ }), 'Fine');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith({ [name.id]: 'Ada', [visit.id]: 'Fine' });
  });
});
