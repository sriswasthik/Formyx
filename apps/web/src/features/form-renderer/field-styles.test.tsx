import {
  CHOICE_STYLES,
  createDefaultTheme,
  createField,
  FIELD_TYPES,
  INPUT_STYLES,
  type AnswerValue,
  type Field,
  type FieldType,
  type FormTheme,
  type ThemeComponents,
} from '@formyx/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FieldRenderer } from './field-renderer';
import { ThemeRenderer } from './theme/theme-renderer';

/*
 * Every field type in every input style, and choice fields in every choice style: each must
 * keep its accessible name, take the style's variables and still work from the keyboard.
 */

const base = createDefaultTheme();

function themeWith(components: Partial<ThemeComponents>): FormTheme {
  return { ...base, components: { ...base.components, ...components } };
}

function Harness({
  field,
  theme,
  onValue,
}: {
  field: Field;
  theme: FormTheme;
  onValue: (value: AnswerValue) => void;
}) {
  const [value, setValue] = useState<AnswerValue | undefined>(undefined);
  return (
    <ThemeRenderer theme={theme} variant="frame">
      <FieldRenderer
        field={field}
        mode="respondent"
        idPrefix="styles"
        value={value}
        onChange={(_id, next) => {
          setValue(next);
          onValue(next);
        }}
      />
    </ThemeRenderer>
  );
}

function setup(type: FieldType, theme: FormTheme) {
  const field = { ...createField(type), label: 'Question' };
  const onValue = vi.fn<(value: AnswerValue) => void>();
  const { container } = render(<Harness field={field} theme={theme} onValue={onValue} />);
  const root = container.querySelector<HTMLElement>('[data-form-theme]');
  if (!root) throw new Error('No theme root');
  return { field, onValue, root, user: userEvent.setup() };
}

/** What each input style sets on the theme root. */
const INPUT_RADIUS: Record<(typeof INPUT_STYLES)[number], string> = {
  outlined: '10px',
  filled: '10px',
  underline: '0px',
  pill: '9999px',
  minimal: '10px',
};

/** The class each kind of control takes its look from. */
const STYLE_SOURCE = {
  text: 'bg-(--form-input-bg)',
  choice: 'bg-(--form-choice-bg)',
  box: 'bg-(--form-box-bg)',
};

describe.each(INPUT_STYLES)('the %s input style', (inputStyle) => {
  const theme = themeWith({ inputStyle });

  it.each(FIELD_TYPES)('draws %s questions with it', async (type) => {
    const { root, onValue, user } = setup(type, theme);
    expect(root.style.getPropertyValue('--form-input-radius')).toBe(INPUT_RADIUS[inputStyle]);
    expect(root.style.getPropertyValue('--form-input-border-hover')).not.toBe('');

    switch (type) {
      case 'short_text':
      case 'email':
      case 'phone':
      case 'number':
      case 'long_text': {
        const input = screen.getByRole('textbox', { name: 'Question' });
        expect(input.className).toContain(STYLE_SOURCE.text);
        expect(input.className).toContain('hover:border-(--form-input-border-hover)');
        await user.type(input, '42');
        expect(onValue).toHaveBeenLastCalledWith('42');
        break;
      }
      case 'date': {
        const input = screen.getByLabelText('Question');
        expect(input).toHaveAttribute('type', 'date');
        expect(input.className).toContain(STYLE_SOURCE.text);
        break;
      }
      case 'dropdown': {
        const select = screen.getByRole('combobox', { name: 'Question' });
        expect(select.className).toContain(STYLE_SOURCE.text);
        await user.selectOptions(select, 'Option 2');
        expect(onValue).toHaveBeenCalledTimes(1);
        break;
      }
      case 'single_choice':
      case 'multi_choice':
      case 'rating': {
        const group = screen.getByRole('group', { name: 'Question' });
        const role = type === 'multi_choice' ? 'checkbox' : 'radio';
        const [first] = within(group).getAllByRole(role);
        if (!first) throw new Error('No options');
        expect(first.closest('label')?.className).toContain(STYLE_SOURCE.choice);
        first.focus();
        await user.keyboard(' ');
        expect(first).toBeChecked();
        expect(onValue).toHaveBeenCalled();
        break;
      }
      case 'file': {
        const input = screen.getByLabelText(/Question/);
        expect(input).toHaveAttribute('type', 'file');
        expect(input.closest('label')?.className).toContain(STYLE_SOURCE.box);
        break;
      }
      case 'statement':
        expect(screen.getByText('Question')).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        break;
    }
  });
});

describe.each(CHOICE_STYLES)('the %s choice style', (choiceStyle) => {
  const theme = themeWith({ choiceStyle });

  it.each(['single_choice', 'multi_choice'] as const)(
    'lays out %s options and marks picked ones beyond colour',
    async (type) => {
      const { user } = setup(type, theme);
      const group = screen.getByRole('group', { name: 'Question' });
      const list = group.querySelector('[data-choice-style]');
      expect(list).toHaveAttribute('data-choice-style', choiceStyle);

      const role = type === 'multi_choice' ? 'checkbox' : 'radio';
      const options = within(group).getAllByRole(role);
      expect(options).toHaveLength(createField(type).options.length);
      const [first, second] = options;
      if (!first || !second) throw new Error('Too few options');

      await user.click(second);
      expect(second).toBeChecked();
      const label = second.closest('label');
      if (!label) throw new Error('No label');
      // A radio or checkbox drawn beside it, or a tick in pills and buttons.
      expect(label.querySelector('svg, span[aria-hidden] > span')).not.toBeNull();
      expect(first.closest('label')?.querySelector('svg')).toBeNull();

      // The native inputs keep arrow keys and Space working.
      first.focus();
      await user.keyboard(' ');
      expect(first).toBeChecked();
    },
  );
});
