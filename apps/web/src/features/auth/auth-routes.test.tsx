import type { MeResponse } from '@formyx/shared';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { signInProvidersQuery } from './auth-api';
import { GUEST_WAIT_MS, GuestRoute } from './guest-route';
import { LoginPage } from './login-page';
import { ProtectedRoute } from './protected-route';
import { setSessionHint } from './session-cache';

function AppPage() {
  const { pathname, search } = useLocation();
  return <h1>App page {`${pathname}${search}`}</h1>;
}

/**
 * `session: 'fetch'` leaves the "me" query to the stubbed network instead of seeding it, and
 * `providers: 'fetch'` the list of "Continue with…" providers.
 */
function renderRoutes(
  initialEntry: string | { pathname: string; state: unknown },
  {
    session = ADA,
    providers = [],
  }: { session?: MeResponse | null | 'fetch'; providers?: [] | 'fetch' } = {},
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
  const queryClient = createTestQueryClient(session === 'fetch' ? undefined : session);
  if (providers !== 'fetch') queryClient.setQueryData(signInProvidersQuery.queryKey, providers);
  renderWithProviders(<RouterProvider router={router} />, queryClient);
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
    const asked: string[] = [];
    stubFetch((path) => {
      asked.push(path);
      return jsonResponse(ADA);
    });
    const router = renderRoutes('/app/forms', { session: 'fetch' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    // The log-in page may ask which providers there are, but never about the session.
    expect(asked.filter((path) => path.endsWith('/auth/me'))).toEqual([]);
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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('shows the page when the session check is slow, and still sends them on if it answers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    setSessionHint(true);
    let answer: (response: Response) => void = () => {};
    stubFetch((path) =>
      path.endsWith('/auth/me')
        ? new Promise<Response>((resolve) => {
            answer = resolve;
          })
        : jsonResponse({ providers: [] }),
    );
    const router = renderRoutes('/login', { session: 'fetch' });

    expect(screen.queryByRole('heading', { name: 'Log in to Formyx' })).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(GUEST_WAIT_MS);
    });
    expect(screen.getByRole('heading', { name: 'Log in to Formyx' })).toBeInTheDocument();

    vi.useRealTimers();
    answer(jsonResponse(ADA));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app');
    });
  });

  it('holds the page until it knows which providers there are, so the form does not jump', async () => {
    let answer: (response: Response) => void = () => {};
    stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    renderRoutes('/login', { session: null, providers: 'fetch' });

    expect(screen.queryByRole('heading', { name: 'Log in to Formyx' })).not.toBeInTheDocument();
    answer(jsonResponse({ providers: ['google'] }));
    expect(await screen.findByRole('heading', { name: 'Log in to Formyx' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toBeInTheDocument();
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
