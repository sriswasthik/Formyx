import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { meQueryKey } from '@/features/auth/session-cache';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { DeleteAccountCard, PasswordCard } from './account-security-cards';

function renderCards(handler: (path: string, body: unknown) => Response) {
  const requests: { path: string; body: unknown }[] = [];
  stubFetch((path, init) => {
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    requests.push({ path, body });
    return handler(path, body);
  });
  const queryClient = createTestQueryClient(ADA);
  const router = createMemoryRouter(
    [
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: '/app/settings',
            element: (
              <>
                <PasswordCard />
                <DeleteAccountCard />
              </>
            ),
          },
          { path: '/login', element: <p>Log in</p> },
        ],
      },
      { path: '/', element: <h1>Home</h1> },
    ],
    { initialEntries: ['/app/settings'] },
  );
  renderWithProviders(<RouterProvider router={router} />, queryClient);
  return { requests, queryClient, user: userEvent.setup() };
}

const wrongPassword = () =>
  jsonResponse({ error: { code: 'WRONG_CODE', message: 'That password is not right.' } }, 400);

describe('PasswordCard', () => {
  it('changes the password, checking the new one first', async () => {
    const { requests, user } = renderCards(() => new Response(null, { status: 204 }));

    await user.type(screen.getByLabelText('Current password'), 'old password');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/Use at least/)).toBeInTheDocument();
    expect(requests).toEqual([]);

    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), 'a much longer password');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      expect(requests).toEqual([
        {
          path: '/api/account/password',
          body: { currentPassword: 'old password', newPassword: 'a much longer password' },
        },
      ]);
    });
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
  });

  it('says when the current password is wrong, and stays signed in', async () => {
    const { queryClient, user } = renderCards(wrongPassword);

    await user.type(screen.getByLabelText('Current password'), 'not it at all');
    await user.type(screen.getByLabelText('New password'), 'a much longer password');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('That password is not right')).toBeInTheDocument();
    expect(queryClient.getQueryData(meQueryKey)).toEqual(ADA);
  });
});

describe('DeleteAccountCard', () => {
  it('names the shared workspaces that need another owner first', async () => {
    const { user } = renderCards(() =>
      jsonResponse(
        {
          error: {
            code: 'LAST_OWNER',
            message: 'Make someone else an owner first.',
            details: { workspaces: [{ id: 'ws_team', name: 'Analytical Engines' }] },
          },
        },
        409,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    await user.type(screen.getByLabelText('Your password'), 'my password');
    await user.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /only owner of this shared workspace/,
    );
    expect(screen.getByText('Analytical Engines')).toBeInTheDocument();
  });

  it('deletes the account and signs out', async () => {
    const { requests, queryClient, user } = renderCards(() => new Response(null, { status: 204 }));

    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    await user.type(screen.getByLabelText('Your password'), 'my password');
    await user.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(requests).toEqual([{ path: '/api/account/delete', body: { password: 'my password' } }]);
    expect(queryClient.getQueryData(meQueryKey)).toBeNull();
  });
});
