import {
  createDefaultTheme,
  createEmptyForm,
  createField,
  ENGLISH_LOCALE,
  type FormSchema,
} from '@formyx/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FormView } from './form-view';

/*
 * Telugu and Devanagari text gets a font of its own (Noto Sans), whichever the theme's fonts
 * are, loaded only for forms that need it.
 */

const theme = createDefaultTheme();
const name = { ...createField('short_text'), label: 'Name' };

function renderForm(schema: FormSchema, locale = ENGLISH_LOCALE) {
  const view = render(<FormView title="Survey" schema={schema} theme={theme} locale={locale} />);
  const root = () => view.container.querySelector<HTMLElement>('[data-form-theme]');
  const bodyFont = () => root()?.style.getPropertyValue('--form-body-font') ?? '';
  return { bodyFont, user: userEvent.setup() };
}

describe('fonts for Telugu and Devanagari text', () => {
  it('leaves Latin-only forms with the theme’s fonts', () => {
    const { bodyFont } = renderForm({ ...createEmptyForm(), fields: [name] });
    expect(bodyFont()).not.toContain('Noto Sans');
  });

  it('adds Noto Sans Telugu for a form whose words are Telugu, before the generic families', () => {
    const { bodyFont } = renderForm({
      ...createEmptyForm(),
      fields: [{ ...name, label: 'మీ పేరు' }],
    });
    expect(bodyFont()).toMatch(/'Noto Sans Telugu', ui-sans-serif/);
    expect(bodyFont()).not.toContain('Devanagari');
  });

  it('adds it for a form in Hindi, whatever its words', () => {
    const { bodyFont } = renderForm(
      { ...createEmptyForm(), fields: [name] },
      { ...ENGLISH_LOCALE, format: { ...ENGLISH_LOCALE.format, language: 'hi' } },
    );
    expect(bodyFont()).toContain("'Noto Sans Devanagari'");
  });

  it('adds it once a respondent types in that script', async () => {
    const { bodyFont, user } = renderForm({ ...createEmptyForm(), fields: [name] });

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'राम');

    expect(bodyFont()).toContain("'Noto Sans Devanagari'");
  });
});
