import { ACCENT_PRESETS, createField } from '@formyx/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EditorCanvas } from '../canvas/editor-canvas';
import { useEditorStore } from '../editor-store-context';
import { makeFormDetail, renderWithEditor } from '../test-utils';
import { DesignPanel } from './design-panel';
import { parseHexInput } from './hex';

/** The canvas with the store's live theme, as the editor shows it. */
function Canvas() {
  const theme = useEditorStore((state) => state.theme);
  return <EditorCanvas theme={theme} emptyHint="Empty" />;
}

function renderPanel() {
  const form = makeFormDetail([{ ...createField('short_text'), label: 'Your name' }]);
  return renderWithEditor(
    <>
      <DesignPanel />
      <Canvas />
    </>,
    form,
  );
}

/** The element the canvas applies the theme's variables to. */
function canvasTheme() {
  const heading = screen.getByRole('heading', { level: 2, name: 'Customer survey' });
  const scope = heading.closest<HTMLElement>('[style]');
  if (!scope) throw new Error('No themed element');
  return scope.style;
}

describe('DesignPanel', () => {
  it('changes the accent from a preset, live in the canvas, and undoes in one step', async () => {
    const { user, store } = renderPanel();
    const accents = screen.getByRole('radiogroup', { name: 'Accent colour' });
    expect(within(accents).getAllByRole('radio')).toHaveLength(ACCENT_PRESETS.length);
    expect(within(accents).getByRole('radio', { name: 'Blue' })).toBeChecked();

    await user.click(within(accents).getByRole('radio', { name: 'Rust' }));

    expect(store.getState().theme.accentColor).toBe('#B1563B');
    expect(canvasTheme().getPropertyValue('--form-accent')).toBe('#B1563B');
    expect(screen.getByRole('textbox', { name: 'Custom colour' })).toHaveValue('#B1563B');

    store.getState().undo();
    expect(store.getState().theme.accentColor).toBe('#4370BD');
  });

  it('takes a custom hex colour, and warns when it is hard to see', async () => {
    const { user, store } = renderPanel();
    const hex = screen.getByRole('textbox', { name: 'Custom colour' });

    await user.clear(hex);
    await user.type(hex, 'f4e8a1');

    expect(store.getState().theme.accentColor).toBe('#F4E8A1');
    expect(
      within(screen.getByRole('radiogroup', { name: 'Accent colour' })).queryByRole('radio', {
        checked: true,
      }),
    ).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/Low contrast: 1\.\d:1/);
  });

  it('points out a hex that is not one, and keeps the last good colour', async () => {
    const { user, store } = renderPanel();
    const hex = screen.getByRole('textbox', { name: 'Custom colour' });

    await user.clear(hex);
    await user.type(hex, '12zz');
    await user.tab();

    expect(hex).toHaveAccessibleDescription('Use six hex digits, such as 4370BD.');
    expect(hex).toHaveAttribute('aria-invalid', 'true');
    expect(store.getState().theme.accentColor).toBe('#4370BD');
  });

  it('switches font, corners and background', async () => {
    const { user, store } = renderPanel();

    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Font' })).getByRole('radio', {
        name: /Serif/,
      }),
    );
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Corners' })).getByRole('radio', {
        name: /Sharp/,
      }),
    );
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Background' })).getByRole('radio', {
        name: /Dark/,
      }),
    );

    expect(store.getState().theme).toMatchObject({
      font: 'serif',
      radius: 'sharp',
      background: 'dark',
    });
    const style = canvasTheme();
    expect(style.getPropertyValue('--form-bg')).toBe('#18181B');
    expect(style.getPropertyValue('--form-radius')).toBe('0px');
    expect(style.fontFamily).toMatch(/Source Serif 4/);
  });
});

describe('parseHexInput', () => {
  it.each([
    ['4370bd', '#4370BD'],
    ['#4370BD', '#4370BD'],
    ['  #4370bd ', '#4370BD'],
    ['437', null],
    ['#4370BDX', null],
    ['', null],
  ])('%j -> %j', (input, expected) => {
    expect(parseHexInput(input)).toBe(expected);
  });
});
