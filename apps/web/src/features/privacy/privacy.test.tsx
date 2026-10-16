import type { DataExport, MeResponse, RespondentLookupResponse } from '@formyx/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ProtectedRoute } from '@/features/auth/protected-route';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { DataExportCard } from './data-export-card';
import { DataRequestsLog } from './data-requests-log';
import { DeletionBanner } from './deletion-banner';
import { RespondentRequestsCard } from './respondent-requests-card';
import { RestoreAccountPage } from './restore-account-page';

interface Sent {
  method: string;
  path: string;
  body: unknown;
}

function renderSignedIn(
  element: React.ReactElement,
  handler: (path: string, method: string) => Response,
  me: MeResponse = ADA,
) {
  const sent: Sent[] = [];
  stubFetch((path, init) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    sent.push({ method, path, body });
    return handler(path, method);
  });
  const router = createMemoryRouter(
    [
      {
        element: <ProtectedRoute />,
        children: [{ path: '/app/settings', element }],
      },
    ],
    { initialEntries: ['/app/settings'] },
  );
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(me));
  return { sent, user: userEvent.setup() };
}

const ready: DataExport = {
  id: 'exp_1',
  status: 'READY',
  createdAt: '2026-10-16T09:00:00.000Z',
  readyAt: '2026-10-16T09:01:00.000Z',
  expiresAt: '2026-10-23T09:00:00.000Z',
  bytes: 48_000,
};

describe('DataExportCard', () => {
  it('asks for a copy of my data, then offers it to download', async () => {
    let exports: DataExport[] = [];
    const { sent, user } = renderSignedIn(<DataExportCard />, (_path, method) => {
      if (method === 'POST') {
        exports = [{ ...ready, status: 'PENDING', readyAt: null, bytes: null }];
        return jsonResponse(exports[0], 202);
      }
      return jsonResponse({ exports });
    });

    await user.click(await screen.findByRole('button', { name: 'Request my data' }));

    expect(await screen.findByText('We’re preparing your data')).toBeInTheDocument();
    expect(sent).toContainEqual({ method: 'POST', path: '/api/account/exports', body: {} });
    expect(await screen.findByRole('button', { name: 'Preparing your data…' })).toBeDisabled();
    expect(screen.getByText('Being prepared')).toBeInTheDocument();
  });

  it('links a ready export to its download', async () => {
    renderSignedIn(<DataExportCard />, () => jsonResponse({ exports: [ready] }));

    const link = await screen.findByRole('link', { name: 'Download' });
    expect(link).toHaveAttribute('href', '/api/account/exports/exp_1/download');
    expect(screen.getByText(/47 KB · available until/)).toBeInTheDocument();
  });
});

describe('DeletionBanner', () => {
  it('says when the account goes, and keeps it', async () => {
    const scheduled: MeResponse = {
      ...ADA,
      user: { ...ADA.user, deletionScheduledFor: '2026-10-23T09:00:00.000Z' },
    };
    const { sent, user } = renderSignedIn(
      <DeletionBanner />,
      (path) => (path === '/api/auth/me' ? jsonResponse(ADA) : new Response(null, { status: 204 })),
      scheduled,
    );

    expect(screen.getByRole('region', { name: 'Account deletion' })).toHaveTextContent(
      /Your account will be deleted on/,
    );
    await user.click(screen.getByRole('button', { name: 'Keep my account' }));

    expect(await screen.findByText('Your account is staying')).toBeInTheDocument();
    expect(sent).toContainEqual({ method: 'POST', path: '/api/account/restore', body: {} });
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Account deletion' })).not.toBeInTheDocument();
    });
  });

  it('is not shown otherwise', () => {
    renderSignedIn(<DeletionBanner />, () => jsonResponse(ADA));
    expect(screen.queryByRole('region', { name: 'Account deletion' })).not.toBeInTheDocument();
  });
});

describe('RestoreAccountPage', () => {
  function renderPage(search: string, answer: () => Response) {
    const sent: Sent[] = [];
    stubFetch((path, init) => {
      const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      sent.push({ method: init.method ?? 'GET', path, body });
      return path === '/api/auth/me'
        ? jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Log in' } }, 401)
        : answer();
    });
    const router = createMemoryRouter(
      [{ path: '/account/restore', element: <RestoreAccountPage /> }],
      {
        initialEntries: [`/account/restore${search}`],
      },
    );
    renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(null));
    return sent;
  }

  it('keeps the account the link belongs to', async () => {
    const sent = renderPage(`?token=${'t'.repeat(43)}`, () => new Response(null, { status: 204 }));

    expect(
      await screen.findByRole('heading', { name: 'Your account is staying' }),
    ).toBeInTheDocument();
    expect(sent).toContainEqual({
      method: 'POST',
      path: '/api/public/account/restore',
      body: { token: 't'.repeat(43) },
    });
  });

  it('says when the link no longer works', async () => {
    renderPage(`?token=${'t'.repeat(43)}`, () =>
      jsonResponse({ error: { code: 'NOT_FOUND', message: 'Gone' } }, 404),
    );
    expect(
      await screen.findByRole('heading', { name: 'This link no longer works' }),
    ).toBeInTheDocument();
  });
});

describe('RespondentRequestsCard', () => {
  const workspace = ADA.workspaces[0];
  if (!workspace) throw new Error('ADA has workspaces');
  const found: RespondentLookupResponse = {
    total: 2,
    matches: [
      {
        submissionId: 's1',
        formId: 'f1',
        formTitle: 'Feedback',
        createdAt: '2026-10-10T09:00:00.000Z',
        matchedBy: 'respondent_email',
      },
      {
        submissionId: 's2',
        formId: 'f2',
        formTitle: 'Workshop RSVP',
        createdAt: '2026-10-12T09:00:00.000Z',
        matchedBy: 'answer',
      },
    ],
  };

  it('finds a respondent’s responses and deletes them all', async () => {
    let deleted = false;
    const { sent, user } = renderSignedIn(
      <RespondentRequestsCard workspace={workspace} />,
      (path) => {
        if (path.endsWith('/delete')) {
          deleted = true;
          return jsonResponse({ deleted: 2 });
        }
        return jsonResponse(deleted ? { total: 0, matches: [] } : found);
      },
    );

    await user.type(screen.getByLabelText('Respondent’s email'), 'Ada@Example.com');
    await user.click(screen.getByRole('button', { name: 'Find responses' }));

    expect(await screen.findByText('2 responses hold ada@example.com.')).toBeInTheDocument();
    expect(screen.getByText('Workshop RSVP')).toBeInTheDocument();
    expect(sent).toContainEqual({
      method: 'GET',
      path: '/api/workspaces/ws_personal/respondent-data?email=ada%40example.com',
      body: undefined,
    });

    await user.click(screen.getByRole('button', { name: 'Delete 2 responses' }));
    await user.click(await screen.findByRole('button', { name: 'Delete responses' }));

    expect(await screen.findByText('2 responses deleted')).toBeInTheDocument();
    expect(sent).toContainEqual({
      method: 'POST',
      path: '/api/workspaces/ws_personal/respondent-data/delete',
      body: { email: 'ada@example.com' },
    });
    expect(await screen.findByText('No responses with this address')).toBeInTheDocument();
  });

  it('checks the address before looking', async () => {
    const { sent, user } = renderSignedIn(<RespondentRequestsCard workspace={workspace} />, () =>
      jsonResponse(found),
    );

    await user.type(screen.getByLabelText('Respondent’s email'), 'not an address');
    await user.click(screen.getByRole('button', { name: 'Find responses' }));

    expect(screen.getByText('Enter the respondent’s email address')).toBeInTheDocument();
    expect(sent.filter(({ path }) => path.includes('respondent-data'))).toEqual([]);
  });

  it('is hidden from viewers', () => {
    renderSignedIn(<RespondentRequestsCard workspace={{ ...workspace, role: 'VIEWER' }} />, () =>
      jsonResponse(found),
    );
    expect(screen.queryByText('Respondents’ data requests')).not.toBeInTheDocument();
  });
});

describe('DataRequestsLog', () => {
  it('lists requests with who asked, when, and what came of them', async () => {
    renderSignedIn(<DataRequestsLog />, () =>
      jsonResponse({
        requests: [
          {
            id: 'r1',
            kind: 'RESPONDENT_DELETION',
            status: 'DONE',
            requester: { id: 'user_ada', email: 'ada@example.com' },
            workspaceId: 'ws_personal',
            details: { responses: 2 },
            createdAt: '2026-10-16T09:00:00.000Z',
            completedAt: '2026-10-16T09:00:00.000Z',
          },
          {
            id: 'r2',
            kind: 'ACCOUNT_DELETION',
            status: 'OPEN',
            requester: null,
            workspaceId: null,
            details: { scheduledFor: '2026-10-23T09:00:00.000Z', workspacesToDelete: 1 },
            createdAt: '2026-10-15T09:00:00.000Z',
            completedAt: null,
          },
        ],
      }),
    );

    expect(await screen.findByText('Respondent deletion')).toBeInTheDocument();
    expect(screen.getByText(/ada@example.com · .* · responses 2/)).toBeInTheDocument();
    expect(screen.getByText(/Deleted account · .* · workspaces to delete 1/)).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });
});
