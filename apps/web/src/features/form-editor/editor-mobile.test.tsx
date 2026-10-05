import { createField, type Field } from '@formyx/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EditorLayout } from './editor-layout';
import { makeFormDetail, renderWithEditor } from './test-utils';

function renderMobileEditor(fields: Field[] = []) {
  const form = makeFormDetail(fields);
  return renderWithEditor(<EditorLayout form={form} status={null} />, form, 'mobile');
}

describe('EditorLayout on phones and tablets', () => {
  it('switches between Build, Settings and Preview tabs', async () => {
    const { user } = renderMobileEditor([{ ...createField('short_text'), label: 'Name' }]);

    expect(screen.getByRole('tab', { name: 'Build', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Questions' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Question types' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Form settings' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.type(input, 'Ada');
    expect(input).toHaveValue('Ada');
  });

  it('adds questions from the palette in a bottom sheet', async () => {
    const { user, store } = renderMobileEditor();
    expect(screen.getByText('Tap Add question to get started.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add question' }));
    const sheet = await screen.findByRole('dialog', { name: 'Add a question' });
    await user.click(within(sheet).getByRole('button', { name: 'Add rating' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add a question' })).not.toBeInTheDocument();
    });
    expect(store.getState().schema.fields.map((field) => field.type)).toEqual(['rating']);
    expect(
      within(screen.getByRole('list', { name: 'Questions' })).getByRole('button', {
        name: /Question 1: Untitled question, Rating/,
      }),
    ).toBeInTheDocument();
  });

  it("opens a question's settings from its toolbar", async () => {
    const { user } = renderMobileEditor([{ ...createField('dropdown'), label: 'Country' }]);

    await user.click(screen.getByRole('button', { name: /Question 1: Country/ }));
    await user.click(screen.getByRole('button', { name: 'Question settings' }));

    expect(screen.getByRole('tab', { name: 'Settings', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dropdown' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Options' })).toBeInTheDocument();
  });

  it('stacks the Design Studio under a live preview', async () => {
    const { user, store } = renderMobileEditor([{ ...createField('short_text'), label: 'Name' }]);

    await user.click(screen.getByRole('tab', { name: 'Design' }));

    expect(screen.getByRole('radiogroup', { name: 'Preview size' })).toBeInTheDocument();
    const sections = screen.getByRole('tablist', { name: 'Design sections' });
    await user.click(within(sections).getByRole('tab', { name: 'Background' }));
    await user.click(screen.getByRole('button', { name: 'Add layer' }));
    await user.click(screen.getByRole('menuitem', { name: /Mesh gradient/ }));

    expect(store.getState().theme.background.layers.map((layer) => layer.type)).toEqual([
      'solid',
      'mesh',
    ]);
  });
});
