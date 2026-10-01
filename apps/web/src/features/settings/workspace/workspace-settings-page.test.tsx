import type { Invite, Member, MeResponse } from '@formyx/shared';
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
import { SettingsLayout } from '../settings-layout';
import { WorkspaceSettingsPage } from './workspace-settings-page';

const ada: Member = {
  userId: ADA.user.id,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'OWNER',
  joinedAt: '2026-09-30T08:00:00.000Z',
};
const grace: Member = {
  userId: 'user_grace',
  name: 'Grace Hopper',
  email: 'grace@example.com',
  role: 'EDITOR',
  joinedAt: '2026-09-30T09:00:00.000Z',
};

interface Request {
  method: string;
  path: string;
  body: unknown;
}

/** An API for one workspace's members and invites, recording every request. */
function serve({
  members = [ada, grace],
  invites = [] as Invite[],
  roleChange,
  inviteError,
}: {
  members?: Member[];
  invites?: Invite[];
  roleChange?: () => Response;
  inviteError?: () => Response;
} = {}) {
  const requests: Request[] = [];
  stubFetch((path, init) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    requests.push({ method, path, body });
    const memberMatch = /\/members\/([^/]+)$/.exec(path);
    const inviteMatch = /\/invites\/([^/]+?)(\/resend)?$/.exec(path);

    if (path.endsWith('/members') && method === 'GET') return jsonResponse({ members });
    if (memberMatch && method === 'PATCH') {
      if (roleChange) return roleChange();
      const member = members.find(({ userId }) => userId === memberMatch[1]);
      return jsonResponse({ ...member, ...(body as object) });
    }
    if (path.endsWith('/invites') && method === 'GET') return jsonResponse({ invites });
    if (path.endsWith('/invites') && method === 'POST') {
      if (inviteError) return inviteError();
      const { email, role } = body as { email: string; role: Invite['role'] };
      const invite: Invite = {
        id: 'inv_1',
        email,
        role,
        invitedBy: 'Ada Lovelace',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600_000 + 60_000).toISOString(),
      };
      return jsonResponse({ invite, emailSent: true }, 201);
    }
    if (inviteMatch?.[2] && method === 'POST') {
      const invite = invites.find(({ id }) => id === inviteMatch[1]);
      return jsonResponse({ invite, emailSent: false });
    }
    if (method === 'DELETE') return jsonResponse(null, 204);
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  });
  return requests;
}

function renderSettings(workspaceId: string, me: MeResponse = ADA) {
  useWorkspaceStore.setState({ activeWorkspaceId: workspaceId });
  const router = createMemoryRouter(
    [
      {
        path: 'app',
        element: <ProtectedRoute />,
        children: [
          { path: 'forms', element: <p>Forms page</p> },
          {
            path: 'settings',
            element: <SettingsLayout />,
            children: [{ path: 'workspace', element: <WorkspaceSettingsPage /> }],
          },
        ],
      },
    ],
    { initialEntries: ['/app/settings/workspace'] },
  );
  const queryClient = createTestQueryClient(me);
  renderWithProviders(<RouterProvider router={router} />, queryClient);
  return { router, queryClient, user: userEvent.setup() };
}

const sessionWorkspaceIds = (queryClient: ReturnType<typeof createTestQueryClient>) =>
  queryClient.getQueryData<MeResponse>(meQueryKey)?.workspaces.map(({ id }) => id);

afterEach(() => {
  useWorkspaceStore.setState({ activeWorkspaceId: null });
});

describe('WorkspaceSettingsPage for owners', () => {
  it('changes roles and removes people', async () => {
    const requests = serve();
    const { user } = renderSettings('ws_personal');

    await user.click(await screen.findByRole('combobox', { name: 'Role of Grace Hopper' }));
    await user.click(screen.getByRole('option', { name: 'Viewer' }));

    expect(await screen.findByText('Grace Hopper is now a viewer')).toBeInTheDocument();
    expect(requests).toContainEqual({
      method: 'PATCH',
      path: '/api/workspaces/ws_personal/members/user_grace',
      body: { role: 'VIEWER' },
    });

    await user.click(screen.getByRole('button', { name: 'More actions for Grace Hopper' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove from workspace' }));
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Remove Grace Hopper?' })).getByRole(
        'button',
        { name: 'Remove' },
      ),
    );

    expect(await screen.findByText('Grace Hopper was removed')).toBeInTheDocument();
    expect(screen.queryByText('grace@example.com')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Members' })).toHaveFocus();
  });

  it('explains why the only owner cannot step down', async () => {
    serve({
      roleChange: () =>
        jsonResponse(
          {
            error: {
              code: 'LAST_OWNER',
              message: 'A workspace needs at least one owner. Make someone else an owner first.',
            },
          },
          409,
        ),
    });
    const { user } = renderSettings('ws_personal');

    await user.click(await screen.findByRole('combobox', { name: 'Role of Ada Lovelace' }));
    await user.click(screen.getByRole('option', { name: 'Editor' }));

    expect(
      await screen.findByText(
        'A workspace needs at least one owner. Make someone else an owner first.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeDisabled();
  });

  it('invites people, and sends or withdraws invites', async () => {
    const requests = serve();
    const { user } = renderSettings('ws_personal');

    expect(await screen.findByText('No open invites')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'Lin@Example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(await screen.findByText('Invite sent to lin@example.com')).toBeInTheDocument();
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/workspaces/ws_personal/invites',
      body: { email: 'lin@example.com', role: 'EDITOR' },
    });
    const list = screen.getByRole('list', { name: 'Open invites' });
    expect(within(list).getByText('Expires in 7 days')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('');

    await user.click(
      screen.getByRole('button', { name: 'Withdraw the invite to lin@example.com' }),
    );
    expect(await screen.findByText('Invite to lin@example.com withdrawn')).toBeInTheDocument();
    expect(screen.getByText('No open invites')).toBeInTheDocument();
  });

  it('says when an invite email did not go out, and marks expired invites', async () => {
    serve({
      invites: [
        {
          id: 'inv_old',
          email: 'old@example.com',
          role: 'VIEWER',
          invitedBy: 'Ada Lovelace',
          createdAt: '2026-09-01T00:00:00.000Z',
          expiresAt: '2026-09-08T00:00:00.000Z',
        },
      ],
    });
    const { user } = renderSettings('ws_personal');

    const list = await screen.findByRole('list', { name: 'Open invites' });
    expect(within(list).getByText('Expired')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resend the invite to old@example.com' }));

    expect(
      await screen.findByText('The invite was saved, but the email didn’t send'),
    ).toBeInTheDocument();
  });

  it('shows the server’s problem with an email next to it', async () => {
    serve({
      inviteError: () =>
        jsonResponse(
          {
            error: {
              code: 'CONFLICT',
              message: 'This person is already a member of the workspace',
              details: [
                { path: 'email', message: 'This person is already a member of the workspace' },
              ],
            },
          },
          409,
        ),
    });
    const { user } = renderSettings('ws_personal');

    const email = await screen.findByRole('textbox', { name: 'Email' });
    await user.type(email, 'grace@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() => {
      expect(email).toHaveAccessibleDescription('This person is already a member of the workspace');
    });
  });

  it('deletes the workspace once its name is typed', async () => {
    const requests = serve();
    const { user, router, queryClient } = renderSettings('ws_personal');

    await user.click(await screen.findByRole('button', { name: 'Delete workspace' }));
    const dialog = screen.getByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete workspace' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox'), "Ada's workspace");
    await user.click(confirm);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/forms');
    });
    expect(requests).toContainEqual({
      method: 'DELETE',
      path: '/api/workspaces/ws_personal',
      body: undefined,
    });
    expect(sessionWorkspaceIds(queryClient)).toEqual(['ws_team']);
  });
});

describe('WorkspaceSettingsPage for other members', () => {
  it('shows who is there without ways to change it, and lets them leave', async () => {
    const requests = serve({
      members: [
        { ...grace, role: 'OWNER' },
        { ...ada, role: 'EDITOR' },
      ],
    });
    const { user, router, queryClient } = renderSettings('ws_team');

    expect(await screen.findByText('grace@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Invite people' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete workspace' })).not.toBeInTheDocument();
    expect(screen.getByText('Only owners can rename the workspace.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Leave' }));
    await user.click(screen.getByRole('button', { name: 'Leave workspace' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/forms');
    });
    expect(requests).toContainEqual({
      method: 'DELETE',
      path: '/api/workspaces/ws_team/members/user_ada',
      body: undefined,
    });
    expect(sessionWorkspaceIds(queryClient)).toEqual(['ws_personal']);
  });
});
