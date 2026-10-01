import { createDefaultTheme, createField, type AnswerValue, type Field } from '@formyx/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FieldRenderer } from './field-renderer';
import { FormThemeScope } from './form-theme';

/** Renders one question with working state, like a form would. */
function Harness({ field, onValue }: { field: Field; onValue?: (value: AnswerValue) => void }) {
  const [value, setValue] = useState<AnswerValue | undefined>(undefined);
  return (
    <FormThemeScope theme={createDefaultTheme()}>
      <FieldRenderer
        field={field}
        mode="respondent"
        idPrefix="test"
        value={value}
        onChange={(_id, next) => {
          setValue(next);
          onValue?.(next);
        }}
      />
    </FormThemeScope>
  );
}

function setup(field: Field) {
  const onValue = vi.fn<(value: AnswerValue) => void>();
  render(<Harness field={field} onValue={onValue} />);
  return { onValue, user: userEvent.setup() };
}

describe('FieldRenderer in respondent mode', () => {
  it('labels text questions, marks required ones and links the description', async () => {
    const { onValue, user } = setup({
      ...createField('short_text'),
      label: 'Full name',
      description: 'As on your passport',
      placeholder: 'Ada Lovelace',
      required: true,
    });

    const input = screen.getByRole('textbox', { name: 'Full name (required)' });
    expect(input).toHaveAccessibleDescription('As on your passport');
    expect(input).toHaveAttribute('placeholder', 'Ada Lovelace');
    expect(input).toHaveAttribute('aria-required', 'true');

    await user.type(input, 'Ada');
    expect(onValue).toHaveBeenLastCalledWith('Ada');
    await user.clear(input);
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it.each([
    ['email', 'email'],
    ['phone', 'tel'],
    ['number', 'text'],
    ['date', 'date'],
  ] as const)('uses a suitable input for %s questions', (type, inputType) => {
    const { container } = render(
      <FieldRenderer field={{ ...createField(type), label: 'Q' }} mode="respondent" idPrefix="t" />,
    );
    expect(container.querySelector('input')).toHaveAttribute('type', inputType);
  });

  it('uses a textarea for long text', () => {
    setup({ ...createField('long_text'), label: 'Tell us more' });
    expect(screen.getByRole('textbox', { name: 'Tell us more' }).tagName).toBe('TEXTAREA');
  });

  it('picks one option for single choice', async () => {
    const field = createField('single_choice');
    const { onValue, user } = setup({ ...field, label: 'Pick one' });

    expect(screen.getByRole('group', { name: 'Pick one' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Option 2' }));

    expect(screen.getByRole('radio', { name: 'Option 2' })).toBeChecked();
    expect(onValue).toHaveBeenLastCalledWith(field.options[1]?.id);
  });

  it('toggles several options for multiple choice, and clears to null', async () => {
    const field = createField('multi_choice');
    const [first, second] = field.options.map((option) => option.id);
    const { onValue, user } = setup(field);

    await user.click(screen.getByRole('checkbox', { name: 'Option 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Option 2' }));
    expect(onValue).toHaveBeenLastCalledWith([first, second]);

    await user.click(screen.getByRole('checkbox', { name: 'Option 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Option 2' }));
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it('offers dropdown options with a placeholder', async () => {
    const field = { ...createField('dropdown'), label: 'Country', placeholder: 'Choose one' };
    const { onValue, user } = setup(field);
    const select = screen.getByRole('combobox', { name: 'Country' });

    expect(select).toHaveDisplayValue('Choose one');
    await user.selectOptions(select, 'Option 1');
    expect(onValue).toHaveBeenLastCalledWith(field.options[0]?.id);
  });

  it('shows one button per rating and supports the keyboard', async () => {
    const { onValue, user } = setup({ ...createField('rating'), label: 'Rate us', ratingScale: 4 });

    const ratings = screen.getAllByRole('radio');
    expect(ratings.map((radio) => radio.parentElement?.textContent)).toEqual(['1', '2', '3', '4']);

    await user.click(screen.getByRole('radio', { name: '2' }));
    await user.keyboard('{ArrowRight}');
    expect(onValue).toHaveBeenLastCalledWith(3);
  });

  it('describes the files a file question takes', () => {
    setup({
      ...createField('file'),
      label: 'CV',
      fileConfig: { maxSizeMb: 5, allowedTypes: ['pdf', 'document'] },
    });

    expect(screen.getByText('PDF or documents, up to 5 MB')).toBeInTheDocument();
    expect(screen.getByLabelText(/CV/)).toHaveAttribute(
      'accept',
      '.pdf,application/pdf,.doc,.docx,.odt,.rtf,.txt',
    );
    // Uploading is covered with the whole form, in file-control.test.tsx.
  });

  it('renders statements as text with no input', () => {
    const { container } = render(
      <FieldRenderer
        field={{ ...createField('statement'), label: 'Thanks for your time.' }}
        mode="respondent"
        idPrefix="t"
      />,
    );
    expect(screen.getByText('Thanks for your time.')).toBeInTheDocument();
    expect(container.querySelector('input, textarea, select')).toBeNull();
  });

  it('shows errors and marks the control invalid', () => {
    render(
      <FieldRenderer
        field={{ ...createField('email'), label: 'Email' }}
        mode="respondent"
        idPrefix="t"
        error="Enter a valid email address"
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid email address');
  });
});

describe('FieldRenderer in editor mode', () => {
  it('looks the same but cannot be operated', () => {
    const { container } = render(
      <FieldRenderer field={createField('short_text')} mode="editor" idPrefix="t" />,
    );
    const root = container.firstElementChild as HTMLElement;

    expect(root.inert).toBe(true);
    expect(root).toHaveClass('pointer-events-none');
    expect(screen.getByText('Untitled question')).toBeInTheDocument();
  });

  it('names empty options and statements', () => {
    render(
      <>
        <FieldRenderer
          field={{ ...createField('single_choice'), options: [{ id: 'o1', label: '' }] }}
          mode="editor"
          idPrefix="a"
        />
        <FieldRenderer field={createField('statement')} mode="editor" idPrefix="b" />
      </>,
    );
    expect(screen.getByText('Untitled option')).toBeInTheDocument();
    expect(screen.getByText('Untitled statement')).toBeInTheDocument();
  });
});
