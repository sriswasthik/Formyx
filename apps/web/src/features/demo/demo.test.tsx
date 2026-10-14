import type { MeResponse } from '@formyx/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { meQueryKey } from '@/features/auth/session-cache';
import { LandingPage } from '@/features/landing/landing-page';
import { AppShell } from '@/features/shell/app-shell';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';

const DEMO: MeResponse = {
  user: {
    id: 'user_demo',
    name: 'Demo account',
    email: 'demo@formyx.example',
    createdAt: '2026-09-01T08:00:00.000Z',
    isDemo: true,
  },
  workspaces: [{ id: 'ws_demo', name: 'Formyx demo', slug: 'formyx-demo-x7k2p9', role: 'OWNER' }],
};

function renderApp(me: MeResponse | null, initialPath: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <LandingPage /> },
      {
        path: 'app',
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [{ path: 'forms', element: <p>Forms content</p> }],
          },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
  const queryClient = createTestQueryClient(me);
  renderWithProviders(<RouterProvider router={router} />, queryClient);
  return { router, queryClient };
}

afterEach(() => {
  vi.unstubAllEnvs();
  useWorkspaceStore.setState({ activeWorkspaceId: null });
});

describe('Try the demo', () => {
  it('is only offered when the build turns the demo on', () => {
    renderApp(null, '/');
    expect(screen.queryByRole('button', { name: 'Try the demo' })).not.toBeInTheDocument();
    // The last call to action is then sign-up alone.
    const cta = screen.getByRole('region', { name: 'Your next form deserves better.' });
    expect(within(cta).getAllByRole('link')).toHaveLength(1);
  });

  it('signs in to the demo workspace and opens its forms', async () => {
    vi.stubEnv('VITE_DEMO_ENABLED', 'true');
    const fetchMock = stubFetch((path) =>
      path === '/api/auth/demo' ? jsonResponse(DEMO) : jsonResponse({}, 404),
    );
    const user = userEvent.setup();
    const { router, queryClient } = renderApp(null, '/');

    await user.click(screen.getByRole('button', { name: 'Try the demo' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/forms');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/demo',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(queryClient.getQueryData(meQueryKey)).toEqual(DEMO);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws_demo');
    expect(await screen.findByText('Forms content')).toBeInTheDocument();
  });

  it('says so when the demo is not available', async () => {
    vi.stubEnv('VITE_DEMO_ENABLED', 'true');
    stubFetch(() =>
      jsonResponse(
        { error: { code: 'NOT_FOUND', message: 'The demo is not available on this server' } },
        404,
      ),
    );
    const user = userEvent.setup();
    const { router } = renderApp(null, '/');

    await user.click(screen.getByRole('button', { name: 'Try the demo' }));

    expect(await screen.findByText('Could not open the demo')).toBeInTheDocument();
    expect(screen.getByText('The demo is not available on this server')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('DemoBanner', () => {
  it('tells demo visitors what to expect', () => {
    renderApp(DEMO, '/app/forms');
    const banner = screen.getByRole('region', { name: 'Demo' });
    expect(banner).toHaveTextContent('You’re exploring a shared demo.');
    expect(banner).toHaveTextContent(/resets every night/);
  });

  it('is not shown to everyone else', () => {
    renderApp(ADA, '/app/forms');
    expect(screen.queryByRole('region', { name: 'Demo' })).not.toBeInTheDocument();
  });

  it('leaves the demo for the sign-up page', async () => {
    const assign = vi.fn();
    // jsdom cannot navigate; only the destination matters here.
    vi.stubGlobal('location', { href: window.location.href, assign });
    const fetchMock = stubFetch(() => jsonResponse(null, 204));
    const user = userEvent.setup();
    renderApp(DEMO, '/app/forms');

    await user.click(screen.getByRole('button', { name: 'Create your account' }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/signup');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
