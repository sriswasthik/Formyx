import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from './app-shell';

function renderShell(initialPath = '/forms') {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          { path: 'forms', element: <p>Forms content</p>, handle: { title: 'Forms' } },
          { path: 'settings', element: <p>Settings content</p>, handle: { title: 'Settings' } },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
  return router;
}

describe('AppShell', () => {
  it('shows the route title as the page heading', () => {
    renderShell('/settings');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Settings content')).toBeInTheDocument();
  });

  it('marks the current page in the sidebar navigation', () => {
    renderShell('/forms');
    const nav = screen.getByRole('navigation', { name: 'Main' });

    expect(within(nav).getByRole('link', { name: 'Forms' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current');
  });

  it('offers a skip link to the main content', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('opens navigation in a sheet on mobile and closes it after navigating', async () => {
    const user = userEvent.setup();
    const router = renderShell('/forms');

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const sheet = await screen.findByRole('dialog', { name: 'Navigation' });

    await user.click(within(sheet).getByRole('link', { name: 'Settings' }));

    expect(router.state.location.pathname).toBe('/settings');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument();
    });
  });
});
