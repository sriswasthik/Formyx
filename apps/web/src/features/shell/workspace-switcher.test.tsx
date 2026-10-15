import type { MeResponse } from '@formyx/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { meQueryKey } from '@/features/auth/session-cache';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { WorkspaceSwitcher } from './workspace-switcher';

function renderSwitcher() {
  const router = createMemoryRouter(
    [
      {
        path: 'app',
        element: <ProtectedRoute />,
        children: [
          { path: 'settings', element: <WorkspaceSwitcher /> },
          { path: 'forms', element: <WorkspaceSwitcher /> },
        ],
      },
    ],
    { initialEntries: ['/app/settings'] },
  );
  const queryClient = createTestQueryClient(ADA);
  renderWithProviders(<RouterProvider router={router} />, queryClient);
  return { router, queryClient, user: userEvent.setup() };
}

/** What was posted to create a workspace, if anything: the plan line asks for entitlements too. */
function createRequests(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls
    .filter(([url, init]) => url === '/api/workspaces' && init?.method === 'POST')
    .map(([, init]) =>
      typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
    );
}

afterEach(() => {
  useWorkspaceStore.setState({ activeWorkspaceId: null });
});

describe('WorkspaceSwitcher', () => {
  it('creates a workspace and switches to it', async () => {
    const fetchMock = stubFetch((path, init) =>
      path === '/api/workspaces' && init.method === 'POST'
        ? jsonResponse(
            { id: 'ws_new', name: 'Marketing', slug: 'marketing-abc123', role: 'OWNER' },
            201,
          )
        : jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404),
    );
    const { router, queryClient, user } = renderSwitcher();

    await user.click(screen.getByRole('button', { name: /Switch workspace/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Create workspace' }));
    const dialog = screen.getByRole('dialog', { name: 'Create a workspace' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Marketing');
    await user.click(within(dialog).getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/forms');
    });
    expect(createRequests(fetchMock)).toEqual([{ name: 'Marketing' }]);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws_new');
    expect(
      queryClient.getQueryData<MeResponse>(meQueryKey)?.workspaces.map(({ name }) => name),
    ).toEqual(["Ada's workspace", 'Analytical Engines', 'Marketing']);
    expect(
      screen.getByRole('button', { name: 'Switch workspace, current workspace: Marketing' }),
    ).toBeInTheDocument();
  });

  it('asks for a name before creating anything', async () => {
    const fetchMock = stubFetch(() => jsonResponse({}));
    const { user } = renderSwitcher();

    await user.click(screen.getByRole('button', { name: /Switch workspace/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Create workspace' }));
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription(
      'Enter a name',
    );
    expect(createRequests(fetchMock)).toEqual([]);
  });
});
