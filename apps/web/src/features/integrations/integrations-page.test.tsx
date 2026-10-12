import type { IntegrationsOverview, IntegrationView } from '@formyx/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { makeFormDetail } from '@/features/form-editor/test-utils';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { IntegrationsPage } from './integrations-page';

const form = makeFormDetail();
const sheets: IntegrationView = {
  id: 'int_1',
  kind: 'google_sheets',
  status: 'active',
  accountLabel: 'ada@example.com',
  connectedBy: 'Ada Lovelace',
  target: { name: 'Google Sheet', url: 'https://docs.google.com/spreadsheets/d/abc/edit' },
  lastSyncedAt: new Date().toISOString(),
  lastError: null,
  lastErrorAt: null,
  createdAt: new Date().toISOString(),
};

function overview(extra: Partial<IntegrationsOverview> = {}): IntegrationsOverview {
  return {
    integrations: [sheets],
    available: { google_sheets: true, notion: false },
    chat: { slack: null, discord: null },
    webhooks: [],
    failures: [],
    ...extra,
  };
}

/** Serves the form and `body` as its overview, recording every change. */
function serve(body: () => IntegrationsOverview) {
  const changes: { method: string; path: string; body: unknown }[] = [];
  stubFetch((path, init) => {
    const method = init.method ?? 'GET';
    if (method !== 'GET') {
      changes.push({
        method,
        path,
        body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      });
    }
    if (path === `/api/forms/${form.id}`) return jsonResponse(form);
    if (path === `/api/forms/${form.id}/integrations`) return jsonResponse(body());
    if (path.endsWith('/google_sheets/connect')) {
      return jsonResponse({ authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
    }
    if (path.endsWith('/integrations/int_1') && method === 'PATCH') {
      return jsonResponse({ ...sheets, status: 'paused' });
    }
    if (method === 'POST' || method === 'DELETE') return new Response(null, { status: 204 });
    return jsonResponse({ error: { code: 'NOT_FOUND', message: `No ${path}` } }, 404);
  });
  return changes;
}

function renderPage(path = `/app/forms/${form.id}/integrations`) {
  const router = createMemoryRouter(
    [
      {
        element: <ProtectedRoute />,
        children: [{ path: '/app/forms/:formId/integrations', element: <IntegrationsPage /> }],
      },
    ],
    { initialEntries: [path] },
  );
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(ADA));
  return { router, user: userEvent.setup() };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('IntegrationsPage', () => {
  it('shows each integration with its state, and what this server can connect', async () => {
    serve(() => overview());
    renderPage();

    const card = await screen.findByRole('article', { name: /Google Sheets/ });
    expect(within(card).getByText('Up to date')).toBeInTheDocument();
    expect(
      within(card).getByText(/As ada@example.com · connected by Ada Lovelace/),
    ).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Open sheet/ })).toHaveAttribute(
      'href',
      sheets.target?.url,
    );

    const notion = screen.getByRole('article', { name: /Notion/ });
    expect(within(notion).getByRole('button', { name: 'Connect Notion' })).toBeDisabled();
    expect(within(notion).getByText('Not set up on this server yet.')).toBeInTheDocument();
    expect(screen.getByText(/Nothing has failed/)).toBeInTheDocument();
  });

  it('sends people to Google to connect a sheet', async () => {
    serve(() => overview({ integrations: [] }));
    const assign = vi.fn();
    const { href, origin, pathname } = window.location;
    vi.stubGlobal('location', { href, origin, pathname, search: '', hash: '', assign });
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Connect Google Sheets' }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    });
  });

  it('asks for a reconnect when access ended, with the reason', async () => {
    serve(() =>
      overview({
        integrations: [
          {
            ...sheets,
            status: 'needs_reconnect',
            lastError: 'Google access was revoked or has expired. Connect it again.',
            lastErrorAt: new Date().toISOString(),
          },
        ],
      }),
    );
    renderPage();

    const card = await screen.findByRole('article', { name: /Google Sheets/ });
    expect(within(card).getByText('Needs reconnecting')).toBeInTheDocument();
    expect(within(card).getByRole('alert')).toHaveTextContent(/revoked or has expired/);
    expect(within(card).getByRole('button', { name: 'Reconnect' })).toBeEnabled();
    expect(within(card).queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });

  it('pauses an integration', async () => {
    const changes = serve(() => overview());
    const { user } = renderPage();

    const card = await screen.findByRole('article', { name: /Google Sheets/ });
    await user.click(within(card).getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      expect(changes).toContainEqual({
        method: 'PATCH',
        path: `/api/forms/${form.id}/integrations/int_1`,
        body: { paused: true },
      });
    });
  });

  it('lists failed jobs, and retries one', async () => {
    let failures = [
      {
        id: 'fail_1',
        queue: 'webhook.deliver',
        integrationId: null,
        webhookId: 'hook_1',
        summary: 'Deliver submission.created to a webhook',
        error: 'The webhook answered 503',
        attempts: 6,
        createdAt: new Date().toISOString(),
      },
    ];
    const changes = serve(() => overview({ failures }));
    const { user } = renderPage();

    const list = await screen.findByRole('list', { name: 'Failed jobs' });
    expect(within(list).getByText('The webhook answered 503')).toBeInTheDocument();
    expect(within(list).getByText(/Tried 6 times/)).toBeInTheDocument();

    failures = [];
    await user.click(within(list).getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(changes).toContainEqual({
        method: 'POST',
        path: `/api/forms/${form.id}/job-failures/fail_1/retry`,
        body: undefined,
      });
    });
    expect(await screen.findByText(/Nothing has failed/)).toBeInTheDocument();
  });

  it('explains why connecting didn’t work, then tidies the address', async () => {
    serve(() => overview({ integrations: [] }));
    const { router } = renderPage(`/app/forms/${form.id}/integrations?connect_error=denied`);

    expect(await screen.findByText(/Access wasn’t granted/)).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.search).toBe('');
    });
  });
});
