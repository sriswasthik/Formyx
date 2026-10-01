import type { InvitePreview, MeResponse } from '@formyx/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { meQueryKey } from '@/features/auth/session-cache';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { InvitePage } from './invite-page';

const TOKEN = 'tok_abc-123';

const PENDING: InvitePreview = {
  status: 'pending',
  workspaceName: 'Analytical Society',
  email: 'ada@example.com',
  role: 'EDITOR',
  invitedBy: 'Charles Babbage',
  expiresAt: '2026-10-08T12:00:00.000Z',
};

const SOCIETY = { id: 'ws_society', name: 'Analytical Society', slug: 'society', role: 'EDITOR' };

function serve(preview: () => Response, accept?: () => Response) {
  const requests: string[] = [];
  stubFetch((path, init) => {
    requests.push(`${init.method ?? 'GET'} ${path}`);
    if (path.endsWith('/accept')) return accept?.() ?? jsonResponse(SOCIETY);
    return preview();
  });
  return requests;
}

function renderInvite(me: MeResponse | null) {
  const router = createMemoryRouter(
    [
      { path: 'invite/:token', element: <InvitePage /> },
      { path: 'login', element: <p>Log in page</p> },
      { path: 'signup', element: <p>Sign up page</p> },
      { path: 'app/forms', element: <p>Forms page</p> },
    ],
    { initialEntries: [`/invite/${TOKEN}`] },
  );
  const queryClient = createTestQueryClient(me);
  renderWithProviders(<RouterProvider router={router} />, queryClient);
  return { router, queryClient, user: userEvent.setup() };
}

afterEach(() => {
  useWorkspaceStore.setState({ activeWorkspaceId: null });
});

describe('InvitePage', () => {
  it('says what the invite is for, and sends signed-out visitors to sign up with its email', async () => {
    serve(() => jsonResponse(PENDING));
    const { router, user } = renderInvite(null);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Join Analytical Society' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Charles Babbage invited you as an editor: build forms and manage responses.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Sign up to accept' }));
    expect(router.state.location.pathname).toBe('/signup');
    expect(router.state.location.state).toEqual({
      from: `/invite/${TOKEN}`,
      email: 'ada@example.com',
    });
  });

  it('joins the workspace for the invited account and opens it', async () => {
    const requests = serve(() => jsonResponse(PENDING));
    const { router, queryClient, user } = renderInvite(ADA);

    await user.click(await screen.findByRole('button', { name: 'Join Analytical Society' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/forms');
    });
    expect(requests).toContain(`POST /api/invites/${TOKEN}/accept`);
    expect(
      queryClient.getQueryData<MeResponse>(meQueryKey)?.workspaces.map(({ id }) => id),
    ).toEqual(['ws_personal', 'ws_team', 'ws_society']);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws_society');
    expect(await screen.findByText('You joined Analytical Society')).toBeInTheDocument();
  });

  it('explains when someone else is signed in', async () => {
    serve(() => jsonResponse({ ...PENDING, email: 'charles@example.com' }));
    renderInvite(ADA);

    expect(await screen.findByText(/but you’re logged in as/)).toHaveTextContent(
      'The invite is for charles@example.com, but you’re logged in as ada@example.com.',
    );
    expect(screen.getByRole('button', { name: 'Log out and switch account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Join/ })).not.toBeInTheDocument();
  });

  it('shows what happened when the invite expired while the page was open', async () => {
    let preview: InvitePreview = PENDING;
    serve(
      () => jsonResponse(preview),
      () => {
        preview = { ...PENDING, status: 'expired' };
        return jsonResponse(
          {
            error: {
              code: 'INVITE_UNAVAILABLE',
              message: 'This invite has expired. Ask for a new one.',
              details: { status: 'expired' },
            },
          },
          410,
        );
      },
    );
    const { user } = renderInvite(ADA);

    await user.click(await screen.findByRole('button', { name: 'Join Analytical Society' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'This invite has expired' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Invite links work for 7 days. Ask Charles Babbage to send a new one.'),
    ).toBeInTheDocument();
  });

  it('explains links that do not work', async () => {
    serve(() => jsonResponse({ error: { code: 'NOT_FOUND', message: 'Invite not found' } }, 404));
    renderInvite(null);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'This invite link doesn’t work' }),
    ).toBeInTheDocument();
  });
});
