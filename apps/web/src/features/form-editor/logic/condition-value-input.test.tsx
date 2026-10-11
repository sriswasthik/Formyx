import { createField, type Field } from '@formyx/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConditionValueInput } from './condition-value-input';

function renderInput(source: Field, value?: string | number) {
  const onChange = vi.fn();
  render(
    <ConditionValueInput
      id="value"
      label="Value"
      source={source}
      value={value}
      invalid={false}
      onChange={onChange}
    />,
  );
  return { onChange, user: userEvent.setup() };
}

describe('ConditionValueInput', () => {
  it('offers yes and no for a yes/no question', async () => {
    const { onChange, user } = renderInput(createField('yes_no'), 'yes');
    const value = screen.getByRole('combobox', { name: 'Value' });
    expect(value).toHaveTextContent('Yes');

    await user.click(value);
    await user.click(screen.getByRole('option', { name: 'No' }));
    expect(onChange).toHaveBeenCalledWith('no');
  });

  it("offers a scale's points as numbers", async () => {
    const { onChange, user } = renderInput(createField('nps'));
    await user.click(screen.getByRole('combobox', { name: 'Value' }));
    const points = screen.getAllByRole('option').map((option) => option.textContent);
    expect(points).toEqual(Array.from({ length: 11 }, (_, point) => String(point)));
    await user.click(screen.getByRole('option', { name: '9' }));
    expect(onChange).toHaveBeenCalledWith(9);
  });

  it('takes a number for a slider', () => {
    renderInput(createField('slider'), 40);
    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue('40');
  });

  it('takes a time for a time question', () => {
    renderInput(createField('time'), '14:30');
    expect(screen.getByLabelText('Value')).toHaveAttribute('type', 'time');
  });
});
