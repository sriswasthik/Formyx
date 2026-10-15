import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { THEME_STORAGE_KEY } from './theme';
import { useThemeStore, useThemeSync } from './theme-store';
import { ThemeSwitch } from './theme-switch';

function Harness() {
  useThemeSync();
  return (
    <TooltipProvider>
      <ThemeSwitch />
    </TooltipProvider>
  );
}

afterEach(() => {
  localStorage.clear();
  useThemeStore.setState({ preference: 'system' });
  document.documentElement.className = '';
});

describe('ThemeSwitch', () => {
  it('shows the current preference as chosen', () => {
    useThemeStore.setState({ preference: 'light' });
    render(<Harness />);

    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System' })).not.toBeChecked();
  });

  it('applies and persists a theme in one click', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('keeps the choice when it is clicked again', async () => {
    useThemeStore.setState({ preference: 'dark' });
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(useThemeStore.getState().preference).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });
});
