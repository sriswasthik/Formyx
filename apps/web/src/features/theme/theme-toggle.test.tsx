import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DARK_MEDIA_QUERY, THEME_STORAGE_KEY } from './theme';
import { useThemeStore, useThemeSync } from './theme-store';
import { ThemeToggle } from './theme-toggle';

function Harness() {
  useThemeSync();
  return (
    <TooltipProvider>
      <ThemeToggle />
    </TooltipProvider>
  );
}

afterEach(() => {
  localStorage.clear();
  useThemeStore.setState({ preference: 'system' });
  document.documentElement.className = '';
});

describe('ThemeToggle', () => {
  it('applies and persists the chosen theme', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Change theme' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Dark' }));

    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('marks the current preference as checked', async () => {
    useThemeStore.setState({ preference: 'light' });
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Change theme' }));

    expect(await screen.findByRole('menuitemradio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('follows the OS when set to system', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query === DARK_MEDIA_QUERY,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    render(<Harness />);

    expect(document.documentElement).toHaveClass('dark');
  });
});
