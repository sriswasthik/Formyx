import { createDefaultTheme, type FormListItem } from '@formyx/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { AppShell } from '@/features/shell/app-shell';
import { useSidebarStore } from '@/features/shell/sidebar-store';
import { useThemeStore } from '@/features/theme/theme-store';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { usePaletteStore } from './palette-store';
import { RECENT_COMMANDS_KEY } from './recent-commands';

const FEEDBACK: FormListItem = {
  id: 'form_1',
  workspaceId: 'ws_personal',
  title: 'Customer feedback',
  slug: 'customer-feedback-abc12345',
  status: 'PUBLISHED',
  version: 1,
  responseCount: 4,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  publishedAt: '2026-10-01T08:00:00.000Z',
  theme: createDefaultTheme(),
  responsesToday: 0,
};

function renderApp() {
  stubFetch((path) =>
    path.startsWith('/api/workspaces/ws_personal/forms')
      ? jsonResponse({ forms: [FEEDBACK], responsesThisMonth: 4 })
      : jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404),
  );
  const router = createMemoryRouter(
    [
      {
        path: 'app',
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [{ path: '*', element: <p>Page</p> }],
          },
        ],
      },
    ],
    { initialEntries: ['/app/forms'] },
  );
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(ADA));
  return { router, user: userEvent.setup() };
}

const palette = () => screen.getByRole('dialog', { name: 'Search and commands' });
const options = () => within(palette()).getAllByRole('option');

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Control>}k{/Control}');
  return screen.findByRole('dialog', { name: 'Search and commands' });
}

afterEach(() => {
  usePaletteStore.setState({ open: false });
  useSidebarStore.setState({ collapsed: false });
  useWorkspaceStore.setState({ activeWorkspaceId: null });
  useThemeStore.setState({ preference: 'system' });
});

describe('CommandPalette', () => {
  it('opens with Ctrl K, ready to type, and closes with it or Escape', async () => {
    const { user } = renderApp();

    const dialog = await openPalette(user);
    expect(within(dialog).getByRole('combobox')).toHaveFocus();

    await user.keyboard('{Control>}k{/Control}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await openPalette(user);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('opens from the search button in the sidebar', async () => {
    const { user } = renderApp();
    const sidebar = screen.getByRole('complementary', { name: 'Sidebar' });

    await user.click(within(sidebar).getByRole('button', { name: /^Search/ }));

    expect(await screen.findByRole('dialog', { name: 'Search and commands' })).toBeVisible();
  });

  it('lists the forms, ways to create one, pages and actions', async () => {
    const { user } = renderApp();
    await openPalette(user);

    const groups = within(palette())
      .getAllByRole('group')
      .map((group) => group.getAttribute('aria-labelledby'))
      .map((id) => (id ? document.getElementById(id)?.textContent : null));
    expect(groups).toEqual(['Forms', 'Create', 'Go to', 'Workspaces', 'Appearance', 'Account']);
    await waitFor(() => {
      expect(within(palette()).getByRole('option', { name: 'Customer feedback' })).toBeVisible();
    });
    expect(within(palette()).getByRole('option', { name: 'Billing' })).toBeInTheDocument();
    expect(
      within(palette()).getByRole('option', { name: 'Switch to Analytical Engines' }),
    ).toBeInTheDocument();
  });

  it('finds things from a loose search, or by their other words', async () => {
    const { user } = renderApp();
    await openPalette(user);
    await screen.findByRole('option', { name: 'Customer feedback' });

    // The best match comes first, with Enter ready to run it.
    await user.keyboard('membrs');
    expect(options()[0]).toHaveTextContent('MembersGo to');
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');

    await user.clear(within(palette()).getByRole('combobox'));
    await user.keyboard('upgrade');
    expect(options()[0]).toHaveTextContent('BillingGo to');

    await user.clear(within(palette()).getByRole('combobox'));
    await user.keyboard('qqqq');
    expect(within(palette()).queryAllByRole('option')).toHaveLength(0);
    expect(within(palette()).getByText('Nothing matches “qqqq”.')).toBeInTheDocument();
  });

  it('moves with the arrow keys and runs the chosen command with Enter', async () => {
    const { router, user } = renderApp();
    await openPalette(user);
    await waitFor(() => {
      expect(within(palette()).getByRole('option', { name: 'Customer feedback' })).toBeVisible();
    });

    await user.keyboard('feedback');
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/forms/form_1/edit');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await openPalette(user);
    await user.keyboard('settings');
    const [first, second] = options();
    expect(first).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveAttribute('aria-selected', 'false');
  });

  it('puts the latest choices first next time', async () => {
    const { router, user } = renderApp();

    await openPalette(user);
    await user.keyboard('members{Enter}');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/settings/members');
    });
    await openPalette(user);
    await user.keyboard('dark theme{Enter}');

    expect(useThemeStore.getState().preference).toBe('dark');
    expect(JSON.parse(localStorage.getItem(RECENT_COMMANDS_KEY) ?? '[]')).toEqual([
      'theme:dark',
      'go:members',
    ]);

    await openPalette(user);
    const recent = within(palette()).getByRole('group', { name: 'Recent' });
    expect(
      within(recent)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Dark theme', 'Members']);
    // Searching leaves the recent list out, so nothing shows twice.
    await user.keyboard('members');
    expect(within(palette()).queryByRole('group', { name: 'Recent' })).not.toBeInTheDocument();
    expect(options().filter((option) => option.textContent === 'MembersGo to')).toHaveLength(1);
  });

  it('switches workspace', async () => {
    const { router, user } = renderApp();
    await openPalette(user);

    await user.keyboard('analytical{Enter}');

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws_team');
    expect(router.state.location.pathname).toBe('/app/forms');
  });

  it('offers editors’ and owners’ commands to them only', async () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws_team' });
    const { user } = renderApp();
    await openPalette(user);

    // Ada edits Analytical Engines but doesn't own it.
    expect(within(palette()).getByRole('option', { name: 'Create a form' })).toBeInTheDocument();
    expect(within(palette()).queryByRole('option', { name: 'Billing' })).not.toBeInTheDocument();
  });

  it('keeps [ for the search while it is open', async () => {
    const { user } = renderApp();
    await openPalette(user);

    // "[[" is how user-event types one "[".
    await user.keyboard('[[');

    expect(within(palette()).getByRole('combobox')).toHaveValue('[');
    expect(useSidebarStore.getState().collapsed).toBe(false);
  });
});
