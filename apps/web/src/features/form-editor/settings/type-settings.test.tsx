import { createField, createOption, type Field, type FieldOfType } from '@formyx/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeFormDetail, renderWithEditor } from '../test-utils';
import { FieldSettings } from './field-settings';

function renderSettings(field: Field) {
  const result = renderWithEditor(<FieldSettings id={field.id} />, makeFormDetail([field]));
  const current = <T extends Field['type']>(_type: T) =>
    result.store.getState().schema.fields[0] as FieldOfType<T>;
  return { ...result, current };
}

describe('settings for newer question types', () => {
  it('edits a matrix’s rows and columns, and lets rows take several answers', async () => {
    const { user, current } = renderSettings(createField('matrix'));

    await user.click(screen.getByRole('button', { name: 'Add row' }));
    expect(current('matrix').rows.map((row) => row.label)).toEqual(['Row 1', 'Row 2', 'Row 3']);

    const column = screen.getByRole('textbox', { name: 'Column 2' });
    await user.clear(column);
    await user.type(column, 'Okay');
    expect(current('matrix').columns.map((item) => item.label)).toEqual(['Poor', 'Okay', 'Good']);

    await user.click(screen.getByRole('switch', { name: 'Several per row' }));
    expect(current('matrix').multiple).toBe(true);
  });

  it('keeps at least two options to rank', () => {
    const field = {
      ...createField('ranking'),
      options: [createOption('A'), createOption('B')],
    };
    renderSettings(field);
    expect(screen.getByRole('button', { name: 'Remove option 1' })).toBeDisabled();
  });

  it('offers faces only on 3- and 5-point scales', async () => {
    const { user, current } = renderSettings({ ...createField('rating'), ratingScale: 7 });

    await user.click(screen.getByRole('combobox', { name: 'Style' }));
    await user.click(screen.getByRole('option', { name: 'Faces' }));
    expect(current('rating')).toMatchObject({ ratingStyle: 'faces', ratingScale: 5 });

    await user.click(screen.getByRole('combobox', { name: 'Rating from 1 to' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['3', '5']);
  });

  it('names a hidden field’s link parameter and hides what does not apply', async () => {
    const { user, current } = renderSettings(createField('hidden'));

    expect(screen.queryByRole('switch', { name: 'Required' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument();
    const param = screen.getByRole('textbox', { name: 'Parameter name' });
    await user.clear(param);
    await user.type(param, 'utm_source');
    expect(current('hidden').paramName).toBe('utm_source');
    expect(screen.getByText('Add ?utm_source=value to the form link to fill it in.')).toBeVisible();
  });

  it('formats consent terms from the toolbar', async () => {
    const { user, current } = renderSettings({ ...createField('consent'), terms: '' });

    const terms = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Terms' });
    await user.type(terms, 'Read the policy');
    terms.setSelectionRange(9, 15);
    const toolbar = screen.getByRole('toolbar', { name: 'Format terms' });
    await user.click(within(toolbar).getByRole('button', { name: 'Bold' }));
    expect(current('consent').terms).toBe('Read the **policy**');
  });

  it('describes images and checks video links', async () => {
    const { user, current, unmount } = renderSettings(createField('image'));
    expect(screen.queryByRole('textbox', { name: 'Question' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Alt text' }), 'A red bicycle');
    expect(current('image').alt).toBe('A red bicycle');
    await user.click(screen.getByRole('radio', { name: 'Medium' }));
    expect(current('image').width).toBe('medium');
    unmount();

    renderSettings(createField('video'));
    await user.type(screen.getByRole('textbox', { name: 'Video link' }), 'https://example.com/v');
    expect(screen.getByText('Use a YouTube or Vimeo link')).toBeInTheDocument();
  });

  it('picks the country a phone question starts on and the currency of an amount', async () => {
    const { user, current, unmount } = renderSettings(createField('phone'));
    expect(screen.getByRole('combobox', { name: 'Starts on' })).toHaveTextContent('India (+91)');
    await user.click(screen.getByRole('combobox', { name: 'Starts on' }));
    await user.click(screen.getByRole('option', { name: 'Singapore (+65)' }));
    expect(current('phone').defaultCountry).toBe('SG');
    unmount();

    const amount = renderSettings(createField('currency'));
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveTextContent(
      'Indian Rupee (INR)',
    );
    await amount.user.click(screen.getByRole('combobox', { name: 'Currency' }));
    await amount.user.click(screen.getByRole('option', { name: 'US Dollar (USD)' }));
    expect(amount.current('currency').currency).toBe('USD');
  });
});
