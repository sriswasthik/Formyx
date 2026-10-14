import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { SiteHeader } from './site-header';

function renderHeader() {
  return render(
    <MemoryRouter>
      <SiteHeader />
    </MemoryRouter>,
  );
}

function scrollTo(y: number) {
  act(() => {
    window.scrollY = y;
    window.dispatchEvent(new Event('scroll'));
  });
}

afterEach(() => {
  window.scrollY = 0;
});

describe('SiteHeader', () => {
  it('links the four sections and the two ways in', () => {
    renderHeader();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Features', 'Templates', 'Pricing', 'Changelog']);
    expect(within(nav).getByRole('link', { name: 'Features' })).toHaveAttribute(
      'href',
      '/#features',
    );
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup');
  });

  it('is transparent at the top, and gains a background and border once scrolled', () => {
    renderHeader();
    const header = screen.getByRole('banner');
    expect(header).not.toHaveAttribute('data-scrolled');
    expect(header).toHaveClass('border-transparent');
    scrollTo(120);
    expect(header).toHaveAttribute('data-scrolled');
    expect(header).toHaveClass('bg-background');
    scrollTo(0);
    expect(header).not.toHaveAttribute('data-scrolled');
  });

  it('opens a menu on phones, which closes when a link is followed', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(
      within(menu)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Features', 'Templates', 'Pricing', 'Changelog', 'Log in', 'Get started']);
    await user.click(within(menu).getByRole('link', { name: 'Pricing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the menu with its close button', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus();
  });
});
