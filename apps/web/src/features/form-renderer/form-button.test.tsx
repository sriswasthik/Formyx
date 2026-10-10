import { createDefaultTheme, type ThemeComponents } from '@formyx/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormButton } from './form-button';
import { ThemeRenderer } from './theme/theme-renderer';

function renderButton(components: Partial<ThemeComponents>, busy = false) {
  const base = createDefaultTheme();
  render(
    <ThemeRenderer
      theme={{ ...base, components: { ...base.components, ...components } }}
      variant="frame"
    >
      <FormButton type="submit" busy={busy}>
        Send
      </FormButton>
    </ThemeRenderer>,
  );
  return screen.getByRole('button', { name: 'Send' });
}

describe('FormButton', () => {
  it('takes the theme’s size and width', () => {
    expect(renderButton({ buttonSize: 'sm' }).className).toMatch(/\bh-9\b/);
  });

  it('spans the form when the theme says so', () => {
    expect(renderButton({ buttonFullWidth: true }).className).toMatch(/\bw-full\b/);
  });

  it('adds a decorative arrow after the text, and a spinner in its place while busy', () => {
    const button = renderButton({ buttonArrow: true });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button.querySelector('[data-button-arrow]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows no arrow while busy', () => {
    const button = renderButton({ buttonArrow: true }, true);
    expect(button.querySelector('[data-button-arrow]')).toBeNull();
    expect(button.querySelector('.motion-safe\\:animate-spin')).not.toBeNull();
  });
});
