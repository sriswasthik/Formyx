import type { MeResponse } from '@formyx/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { GuestRoute } from './guest-route';
import { LoginPage } from './login-page';
import { ProtectedRoute } from './protected-route';
import { setSessionHint } from './session-cache';

function AppPage() {
  const { pathname, search } = useLocation();
  return <h1>App page {`${pathname}${search}`}</h1>;
}

/** `session: 'fetch'` leaves the "me" query to the stubbed network instead of seeding it. */
function renderRoutes(
  initialEntry: string | { pathname: string; state: unknown },
  { session = ADA }: { session?: MeResponse | null | 'fetch' } = {},
) {
  const router = createMemoryRouter(
    [
      {
        element: <GuestRoute />,
        children: [{ path: 'login', element: <LoginPage /> }],
      },
      {
        path: 'app',
        element: <ProtectedRoute />,
        children: [{ path: '*', element: <AppPage /> }],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  renderWithProviders(
    <RouterProvider router={router} />,
    createTestQueryClient(session === 'fetch' ? undefined : session),
  );
  return router;
}

describe('ProtectedRoute', () => {
  it('shows the page to signed-in users', () => {
    renderRoutes('/app/forms');
    expect(screen.getByRole('heading', { name: 'App page /app/forms' })).toBeInTheDocument();
  });

  it('sends signed-out users to /login, remembering where they were going', () => {
    const router = renderRoutes('/app/settings?tab=profile', { session: null });

    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/app/settings?tab=profile' });
    expect(screen.getByRole('heading', { name: 'Log in to Formyx' })).toBeInTheDocument();
  });

  it('returns users to where they were going after logging in', async () => {
    stubFetch(() => jsonResponse(ADA));
    const router = renderRoutes('/app/settings?tab=profile', { session: null });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(
      await screen.findByRole('heading', { name: 'App page /app/settings?tab=profile' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app/settings');
  });

  it('does not ask the API about a session this browser never started', async () => {
    const fetchMock = stubFetch(() => jsonResponse(ADA));
    const router = renderRoutes('/app/forms', { session: 'fetch' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a loading skeleton while the session loads', () => {
    setSessionHint(true);
    stubFetch(() => new Promise<Response>(() => {}));
    renderRoutes('/app/forms', { session: 'fetch' });

    expect(screen.getByRole('status', { name: 'Loading your account' })).toBeInTheDocument();
  });

  it('offers a retry when the session cannot be loaded', async () => {
    setSessionHint(true);
    let failing = true;
    stubFetch(() =>
      failing
        ? jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }, 500)
        : jsonResponse(ADA),
    );
    renderRoutes('/app/forms', { session: 'fetch' });

    expect(await screen.findByText('Could not load your account')).toBeInTheDocument();

    failing = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'App page /app/forms' })).toBeInTheDocument();
  });
});

describe('GuestRoute', () => {
  it('sends signed-in users from /login to the app', async () => {
    const router = renderRoutes('/login');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app');
    });
  });

  it('sends signed-in users on to where they were going', async () => {
    const router = renderRoutes({ pathname: '/login', state: { from: '/app/settings' } });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/settings');
    });
  });

  it('shows the page to signed-out users', () => {
    renderRoutes('/login', { session: null });
    expect(screen.getByRole('heading', { name: 'Log in to Formyx' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/signup',
    );
  });
});
