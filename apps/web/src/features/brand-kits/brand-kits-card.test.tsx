import {
  brandKitFromTheme,
  THEME_PRESETS,
  type BrandKit,
  type BrandKitsResponse,
  type WorkspaceSummary,
} from '@formyx/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { BrandKitsCard } from './brand-kits-card';

function kit(id: string, name: string, presetId: string): BrandKit {
  const preset = THEME_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) throw new Error(`No preset ${presetId}`);
  return {
    id,
    name,
    kit: brandKitFromTheme(preset.theme),
    createdAt: '2026-10-10T08:00:00.000Z',
    updatedAt: '2026-10-10T08:00:00.000Z',
  };
}

const acme = kit('kit_acme', 'Acme', 'paper');
const night = kit('kit_night', 'Night shift', 'midnight');

const workspace = (role: WorkspaceSummary['role']): WorkspaceSummary => ({
  id: 'ws_team',
  name: 'Team',
  slug: 'team',
  role,
});

/** A brand-kit API for one workspace, recording each change. */
function serve(initial: BrandKitsResponse) {
  let state = initial;
  const changes: { method: string; path: string; body: unknown }[] = [];
  stubFetch((path, init) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    if (method !== 'GET') changes.push({ method, path, body });
    if (path.endsWith('/brand-kits') && method === 'GET') return jsonResponse(state);
    if (path.endsWith('/default-brand-kit')) {
      state = { ...state, defaultBrandKitId: (body as { brandKitId: string | null }).brandKitId };
      return jsonResponse(state);
    }
    const match = /\/brand-kits\/([^/]+)$/.exec(path);
    const found = state.brandKits.find((candidate) => candidate.id === match?.[1]);
    if (found && method === 'PATCH') return jsonResponse({ ...found, ...(body as object) });
    if (found && method === 'DELETE') return jsonResponse(null, 204);
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  });
  return changes;
}

function renderCard(role: WorkspaceSummary['role'] = 'EDITOR') {
  const router = createMemoryRouter(
    [{ path: '/', element: <BrandKitsCard workspace={workspace(role)} /> }],
    { initialEntries: ['/'] },
  );
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient());
  return userEvent.setup();
}

describe('BrandKitsCard', () => {
  it('lists the kits with their fonts, marking the default', async () => {
    serve({ brandKits: [night, acme], defaultBrandKitId: acme.id });
    renderCard();
    const list = await screen.findByRole('list', { name: 'Brand kits' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Night shift'),
      expect.stringContaining('Acme'),
    ]);
    expect(rows[1]).toHaveTextContent('Default');
    expect(rows[1]).toHaveTextContent('Source Serif');
  });

  it('shows where kits come from when there are none', async () => {
    serve({ brandKits: [], defaultBrandKitId: null });
    renderCard();
    expect(await screen.findByText('No brand kits yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to forms' })).toHaveAttribute('href', '/app/forms');
  });

  it('makes a kit the default for new forms, and stops', async () => {
    const changes = serve({ brandKits: [acme], defaultBrandKitId: null });
    const user = renderCard();
    await user.click(await screen.findByRole('button', { name: 'More actions for Acme' }));
    await user.click(screen.getByRole('menuitem', { name: 'Use for new forms' }));
    expect(await screen.findByText('Default')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More actions for Acme' }));
    await user.click(screen.getByRole('menuitem', { name: 'Stop using for new forms' }));
    await waitFor(() => {
      expect(screen.queryByText('Default')).not.toBeInTheDocument();
    });
    expect(changes.map(({ body }) => body)).toEqual([
      { brandKitId: acme.id },
      { brandKitId: null },
    ]);
  });

  it('renames and deletes kits', async () => {
    const changes = serve({ brandKits: [acme, night], defaultBrandKitId: null });
    const user = renderCard();
    await user.click(await screen.findByRole('button', { name: 'More actions for Acme' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Acme 2026{Enter}');
    expect(await screen.findByText('Acme 2026')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More actions for Night shift' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(screen.queryByText('Night shift')).not.toBeInTheDocument();
    });
    expect(changes).toEqual([
      {
        method: 'PATCH',
        path: '/api/workspaces/ws_team/brand-kits/kit_acme',
        body: { name: 'Acme 2026' },
      },
      { method: 'DELETE', path: '/api/workspaces/ws_team/brand-kits/kit_night', body: undefined },
    ]);
  });

  it('lets viewers look without changing anything', async () => {
    serve({ brandKits: [acme], defaultBrandKitId: null });
    renderCard('VIEWER');
    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
  });
});
