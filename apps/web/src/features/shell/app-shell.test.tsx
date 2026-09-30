import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { meQueryKey } from '@/features/auth/session-cache';
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  useWorkspaceStore,
} from '@/features/workspaces/workspace-store';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { AppShell } from './app-shell';

function renderShell(initialPath = '/app/forms') {
  const router = createMemoryRouter(
    [
      {
        path: 'app',
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: 'forms', element: <p>Forms content</p>, handle: { title: 'Forms' } },
              { path: 'settings', element: <p>Settings content</p>, handle: { title: 'Settings' } },
            ],
          },
        ],
      },
      { path: 'login', element: <p>Log in page</p> },
    ],
    { initialEntries: [initialPath] },
  );
  const queryClient = createTestQueryClient(ADA);
  renderWithProviders(<RouterProvider router={router} />, queryClient);
  return { router, queryClient };
}

afterEach(() => {
  useWorkspaceStore.setState({ activeWorkspaceId: null });
});

describe('AppShell', () => {
  it('shows the route title as the page heading', () => {
    renderShell('/app/settings');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Settings content')).toBeInTheDocument();
  });

  it('marks the current page in the sidebar navigation', () => {
    renderShell('/app/forms');
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
    const { router } = renderShell('/app/forms');

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const sheet = await screen.findByRole('dialog', { name: 'Navigation' });

    await user.click(within(sheet).getByRole('link', { name: 'Settings' }));

    expect(router.state.location.pathname).toBe('/app/settings');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument();
    });
  });
});

describe('UserMenu', () => {
  it('shows who is signed in', () => {
    renderShell();

    const trigger = screen.getByRole('button', { name: 'Account menu for Ada Lovelace' });
    expect(trigger).toHaveTextContent('AL');
    expect(trigger).toHaveTextContent('ada@example.com');
  });

  it('offers the theme and settings', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Account menu for Ada Lovelace' }));

    expect(await screen.findByRole('menuitem', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/app/settings',
    );
    expect(screen.getByRole('menuitem', { name: 'Theme' })).toBeInTheDocument();
  });

  it('logs out, clears the session and returns to the log-in page', async () => {
    const fetchMock = stubFetch(() => jsonResponse(null, 204));
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws_team' });
    const user = userEvent.setup();
    const { queryClient } = renderShell();

    await user.click(screen.getByRole('button', { name: 'Account menu for Ada Lovelace' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }));

    expect(await screen.findByText('Log in page')).toBeInTheDocument();
    expect(queryClient.getQueryData(meQueryKey)).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/auth/logout');
    expect(init?.method).toBe('POST');
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
  });
});

describe('WorkspaceSwitcher', () => {
  it("lists the user's workspaces with their role, starting with the first", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(
      screen.getByRole('button', { name: "Switch workspace, current workspace: Ada's workspace" }),
    );

    const items = await screen.findAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual([
      "AAda's workspaceOwner",
      'AAnalytical EnginesEditor',
    ]);
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('switches and remembers the active workspace', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: /^Switch workspace/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: /Analytical Engines/ }));

    expect(
      await screen.findByRole('button', {
        name: 'Switch workspace, current workspace: Analytical Engines',
      }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toContain('ws_team');
  });

  it('ignores a remembered workspace the user no longer belongs to', () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws_removed' });
    renderShell();

    expect(
      screen.getByRole('button', { name: "Switch workspace, current workspace: Ada's workspace" }),
    ).toBeInTheDocument();
  });
});
