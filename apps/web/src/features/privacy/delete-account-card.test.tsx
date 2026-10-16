import type { AccountDeletion } from '@formyx/shared';
import { screen } from '@testing-library/react';
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
import { DeleteAccountCard } from './delete-account-card';

const PLAN: AccountDeletion = {
  scheduledFor: null,
  workspaces: [
    {
      id: 'ws_team',
      name: 'Analytical Engines',
      fate: 'choose',
      members: [{ userId: 'user_grace', name: 'Grace Hopper', email: 'grace@example.com' }],
      paidPlan: true,
    },
    { id: 'ws_mine', name: 'My notes', fate: 'alone', members: [], paidPlan: false },
  ],
};

function renderCard(onDelete: (body: unknown) => Response) {
  const requests: { path: string; body: unknown }[] = [];
  stubFetch((path, init) => {
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    requests.push({ path, body });
    if (path === '/api/account/deletion') return jsonResponse(PLAN);
    return onDelete(body);
  });
  const queryClient = createTestQueryClient(ADA);
  const router = createMemoryRouter(
    [
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/app/settings', element: <DeleteAccountCard /> },
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

describe('DeleteAccountCard', () => {
  it('asks what happens to a shared workspace, then schedules the deletion and signs out', async () => {
    const { requests, queryClient, user } = renderCard(() =>
      jsonResponse({ scheduledFor: '2026-10-23T10:00:00.000Z' }, 202),
    );

    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(await screen.findByText('My notes')).toBeInTheDocument();
    expect(screen.getByText('Deleted with its forms and responses.')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Delete account' });
    await user.type(screen.getByLabelText('Your password'), 'my password');
    // Nothing goes until the shared workspace has somewhere to go.
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole('combobox', { name: 'Analytical Engines' }));
    await user.click(
      screen.getByRole('option', { name: 'Give it to Grace Hopper (grace@example.com)' }),
    );
    expect(
      screen.getByText(/Its plan runs to the end of what is paid for, then stops/),
    ).toBeInTheDocument();
    await user.click(submit);

    expect(
      await screen.findByRole('heading', { name: 'Home' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(requests.at(-1)).toEqual({
      path: '/api/account/delete',
      body: {
        password: 'my password',
        workspaces: [{ workspaceId: 'ws_team', action: 'transfer', toUserId: 'user_grace' }],
      },
    });
    expect(queryClient.getQueryData(meQueryKey)).toBeNull();
  });

  it('says when the password is wrong, and stays put', async () => {
    const { user } = renderCard(() =>
      jsonResponse({ error: { code: 'WRONG_CODE', message: 'That password is not right.' } }, 400),
    );

    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    await user.click(await screen.findByRole('combobox', { name: 'Analytical Engines' }));
    await user.click(
      screen.getByRole('option', { name: 'Delete it, with its forms and responses' }),
    );
    expect(screen.getByText('Its plan is cancelled when it is deleted.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your password'), 'not my password');
    await user.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByText('That password is not right')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Home' })).not.toBeInTheDocument();
  });
});
