import {
  createDefaultLogic,
  createDefaultTheme,
  createEmptyForm,
  createField,
  type Field,
  type FormSchema,
} from '@formyx/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FormView, type SubmitOutcome } from './form-view';

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
  settings: { ...createEmptyForm().settings, submitButtonText: 'Send' },
  logic: createDefaultLogic('Thanks, we got it.'),
};

type Props = Partial<React.ComponentProps<typeof FormView>>;

function renderForm(onSubmit?: Props['onSubmit'], props: Props = {}) {
  render(
    <FormView
      title="Feedback"
      schema={schema}
      theme={createDefaultTheme()}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return userEvent.setup();
}

const accepted = (): SubmitOutcome => ({ ok: true });

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Ada');
  await user.click(screen.getByRole('radio', { name: no?.label ?? '' }));
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
    const onSubmit = vi.fn(accepted);
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
    const onSubmit = vi.fn(accepted);
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

  it('shows the theme’s cover and logo as decoration, and nothing without them', () => {
    const defaults = createDefaultTheme();
    const { container, unmount } = render(
      <FormView
        title="Feedback"
        schema={schema}
        theme={{
          ...defaults,
          layout: {
            ...defaults.layout,
            coverImage: {
              url: 'https://res.cloudinary.com/demo/image/upload/cover.jpg',
              focalPoint: { x: 50, y: 30 },
            },
          },
          branding: {
            ...defaults.branding,
            logoUrl: 'https://res.cloudinary.com/demo/image/upload/logo.png',
          },
        }}
      />,
    );
    const images = [...container.querySelectorAll('img')];
    expect(images.map((image) => [image.getAttribute('src'), image.getAttribute('alt')])).toEqual([
      ['https://res.cloudinary.com/demo/image/upload/cover.jpg', ''],
      ['https://res.cloudinary.com/demo/image/upload/logo.png', ''],
    ]);
    unmount();

    renderForm();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows the description under the title', () => {
    renderForm(undefined, { schema: { ...schema, description: 'Two minutes, tops.' } });
    expect(screen.getByText('Two minutes, tops.')).toBeInTheDocument();
  });

  it('shows problems the server found under their questions, and keeps the answers', async () => {
    const onSubmit = vi.fn((): SubmitOutcome => ({
      ok: false,
      fieldErrors: { [name.id]: 'Use a real name' },
      message: 'Some answers need your attention.',
    }));
    const user = renderForm(onSubmit);
    await fillIn(user);

    await user.click(screen.getByRole('button', { name: 'Send' }));

    const nameInput = await screen.findByRole('textbox', { name: /Name/ });
    expect(nameInput).toHaveValue('Ada');
    expect(nameInput).toHaveAccessibleDescription('Use a real name');
    expect(nameInput).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('Some answers need your attention.');
  });

  it('says so when the answers could not be sent, and lets the respondent try again', async () => {
    const onSubmit = vi
      .fn<() => Promise<SubmitOutcome>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true });
    const user = renderForm(onSubmit);
    await fillIn(user);

    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be sent/);

    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Thanks, we got it.')).toBeInTheDocument();
  });

  it('can leave out "Submit another response", and adds hidden inputs to the form', async () => {
    const user = renderForm(vi.fn(accepted), {
      allowAnotherResponse: false,
      hiddenFields: <input aria-label="Hidden extra" />,
    });
    expect(screen.getByRole('textbox', { name: 'Hidden extra' }).closest('form')).not.toBeNull();
    await fillIn(user);

    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Thanks, we got it.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Submit another response' }),
    ).not.toBeInTheDocument();
  });
});
