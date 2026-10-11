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
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { preloadFieldControls } from './controls/registry';
import { FieldRenderer } from './field-renderer';
import { ThemeRenderer } from './theme/theme-renderer';

/*
 * Every field type in every input style, and choice fields in every choice style: each must
 * keep its accessible name, take the style's variables and still work from the keyboard.
 */

const base = createDefaultTheme();

// The newer question types' controls load on demand; the public form preloads them too.
beforeAll(async () => {
  await preloadFieldControls({ fields: FIELD_TYPES.map((type) => createField(type)) });
});

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
    const { field, root, onValue, user } = setup(type, theme);
    expect(root.style.getPropertyValue('--form-input-radius')).toBe(INPUT_RADIUS[inputStyle]);
    expect(root.style.getPropertyValue('--form-input-border-hover')).not.toBe('');

    switch (type) {
      case 'short_text':
      case 'email':
      case 'number':
      case 'long_text':
      case 'url':
      case 'currency': {
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
      case 'phone': {
        const input = screen.getByRole('textbox', { name: 'Question' });
        expect(input).toHaveAttribute('type', 'tel');
        expect(input.className).toContain(STYLE_SOURCE.text);
        expect(screen.getByRole('combobox', { name: 'Country code' })).toHaveValue('IN');
        await user.type(input, '98765 43210');
        expect(onValue).toHaveBeenLastCalledWith('+919876543210');
        break;
      }
      case 'time': {
        const input = screen.getByLabelText('Question');
        expect(input).toHaveAttribute('type', 'time');
        expect(input.className).toContain(STYLE_SOURCE.text);
        break;
      }
      case 'date_range': {
        const group = screen.getByRole('group', { name: 'Question' });
        const dates = group.querySelectorAll('input[type="date"]');
        expect(dates).toHaveLength(2);
        dates.forEach((input) => {
          expect(input.className).toContain(STYLE_SOURCE.text);
        });
        break;
      }
      case 'color': {
        const input = screen.getByRole('textbox', { name: 'Question' });
        expect(input.className).toContain(STYLE_SOURCE.text);
        await user.type(input, '#2e5aac');
        expect(onValue).toHaveBeenLastCalledWith('#2e5aac');
        break;
      }
      case 'address': {
        const group = screen.getByRole('group', { name: 'Question' });
        const line1 = within(group).getByRole('textbox', { name: 'Address line 1' });
        expect(line1.className).toContain(STYLE_SOURCE.text);
        expect(within(group).getByRole('textbox', { name: 'PIN code' })).toBeInTheDocument();
        await user.type(line1, 'MG Road');
        expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ line1: 'MG Road' }));
        break;
      }
      case 'slider': {
        const slider = screen.getByRole('slider', { name: 'Question' });
        expect(slider).toHaveAttribute('aria-valuetext', 'Not answered');
        slider.focus();
        await user.keyboard('{Enter}');
        expect(onValue).toHaveBeenLastCalledWith(50);
        break;
      }
      case 'single_choice':
      case 'multi_choice': {
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
      case 'rating':
      case 'picture_choice':
      case 'yes_no':
      case 'nps':
      case 'opinion_scale':
      case 'matrix': {
        const group = screen.getByRole('group', { name: 'Question' });
        const [first] = within(group).getAllByRole('radio');
        if (!first) throw new Error('No options');
        first.focus();
        await user.keyboard(' ');
        expect(first).toBeChecked();
        expect(onValue).toHaveBeenCalled();
        break;
      }
      case 'ranking': {
        const group = screen.getByRole('group', { name: 'Question' });
        await user.click(within(group).getByRole('button', { name: 'Move Option 1 down' }));
        const [first, second, third] = field.type === 'ranking' ? field.options : [];
        expect(onValue).toHaveBeenLastCalledWith([second?.id, first?.id, third?.id]);
        break;
      }
      case 'consent': {
        // Consent starts required, which its name says.
        const box = screen.getByRole('checkbox', { name: 'Question (required)' });
        await user.click(box);
        expect(onValue).toHaveBeenLastCalledWith(true);
        break;
      }
      case 'signature': {
        const group = screen.getByRole('group', { name: 'Question' });
        expect(within(group).getByRole('button', { name: 'Draw' })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await user.click(within(group).getByRole('button', { name: 'Type' }));
        expect(within(group).getByRole('textbox')).toBeInTheDocument();
        break;
      }
      case 'voice_note': {
        const group = screen.getByRole('group', { name: 'Question' });
        expect(within(group).getByRole('button', { name: 'Record' })).toBeInTheDocument();
        break;
      }
      case 'image':
        expect(screen.getByText('No image yet')).toBeInTheDocument();
        break;
      case 'video':
        expect(screen.getByText('Add a YouTube or Vimeo link')).toBeInTheDocument();
        break;
      case 'divider':
        expect(screen.getByRole('separator')).toBeInTheDocument();
        break;
      case 'page_break':
      case 'hidden':
        // Respondents never see these as fields.
        expect(root.textContent).toBe('');
        break;
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
