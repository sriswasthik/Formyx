import { createDefaultTheme, type FormListItem } from '@formyx/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { usePageTitle } from '@/app/page-title';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { meQueryKey } from '@/features/auth/session-cache';
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  useWorkspaceStore,
} from '@/features/workspaces/workspace-store';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { AppShell } from './app-shell';
import { SIDEBAR_STORAGE_KEY, useSidebarStore } from './sidebar-store';

function FormPage() {
  usePageTitle('Event registration');
  return <p>Form content</p>;
}

/** A page with a text field, to check that typing "[" doesn't fold the sidebar. */
function NotesPage() {
  useEffect(() => {
    document.getElementById('notes')?.focus();
  }, []);
  return <textarea id="notes" aria-label="Notes" />;
}

function renderShell(initialPath = '/app/forms') {
  const router = createMemoryRouter(
    [
      {
        path: 'app',
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: 'forms', element: <p>Forms content</p>, handle: { title: 'Forms' } },
              {
                path: 'forms/:formId',
                element: <FormPage />,
                handle: { title: 'Form', parent: { title: 'Forms', to: '/app/forms' } },
              },
              { path: 'notes', element: <NotesPage />, handle: { title: 'Notes' } },
              {
                path: 'settings',
                handle: { title: 'Settings' },
                children: [
                  { index: true, element: <p>Profile content</p> },
                  {
                    path: 'workspace',
                    element: <p>Workspace content</p>,
                    handle: { title: 'Workspace' },
                  },
                  {
                    path: 'members',
                    element: <p>Members content</p>,
                    handle: { title: 'Members' },
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: 'login', element: <p>Log in page</p> },
    ],
    { initialEntries: [initialPath] },
  );
  const queryClient = createTestQueryClient(ADA);
  renderWithProviders(<RouterProvider router={router} />, queryClient);
  return { router, queryClient, user: userEvent.setup() };
}

function makeForm(id: string, title: string, primary: string): FormListItem {
  const theme = createDefaultTheme();
  return {
    id,
    workspaceId: 'ws_personal',
    title,
    slug: `${id}-abc12345`,
    status: 'DRAFT',
    version: 1,
    responseCount: 0,
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    publishedAt: null,
    theme: { ...theme, colors: { ...theme.colors, primary } },
    responsesToday: 0,
  };
}

const desktopSidebar = () => screen.getByRole('complementary', { name: 'Sidebar' });

afterEach(() => {
  useWorkspaceStore.setState({ activeWorkspaceId: null });
  useSidebarStore.setState({ collapsed: false });
});

describe('AppShell', () => {
  it('shows breadcrumbs below a top-level page', () => {
    renderShell('/app/forms/form_1');

    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'Forms' })).toHaveAttribute(
      'href',
      '/app/forms',
    );
    expect(within(trail).getByText('Event registration')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Form content')).toBeInTheDocument();
  });

  it('leaves the page heading to the page', () => {
    renderShell('/app/forms');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('marks the current page in the sidebar navigation', () => {
    renderShell('/app/settings/members');
    const nav = within(desktopSidebar()).getByRole('navigation', { name: 'Main' });

    expect(within(nav).getByRole('link', { name: 'Members' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Forms' })).not.toHaveAttribute('aria-current');
  });

  it('shows Billing to owners only', async () => {
    const { user } = renderShell();
    const nav = within(desktopSidebar()).getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Billing' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Switch workspace/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: /Analytical Engines/ }));

    await waitFor(() => {
      expect(within(nav).queryByRole('link', { name: 'Billing' })).not.toBeInTheDocument();
    });
  });

  it('lists the latest forms with their colour under Recent', async () => {
    stubFetch((path) =>
      path.startsWith('/api/workspaces/ws_personal/forms')
        ? jsonResponse({
            forms: Array.from({ length: 7 }, (_, index) =>
              makeForm(`form_${index}`, `Form ${index}`, '#2e5aac'),
            ),
            responsesThisMonth: 0,
          })
        : jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404),
    );
    renderShell();

    const recent = await within(desktopSidebar()).findByRole('region', { name: 'Recent' });
    const links = within(recent).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Form 0',
      'Form 1',
      'Form 2',
      'Form 3',
      'Form 4',
    ]);
    expect(links[0]).toHaveAttribute('href', '/app/forms/form_0/edit');
    expect(links[0]?.querySelector('[aria-hidden]')).toHaveStyle({ background: '#2e5aac' });
  });

  it('offers a skip link to the main content', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('opens navigation in a sheet on mobile and closes it after navigating', async () => {
    const { router, user } = renderShell('/app/forms');

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const sheet = await screen.findByRole('dialog', { name: 'Navigation' });
    // The sheet is the full sidebar: it doesn't fold into a rail.
    expect(within(sheet).queryByRole('button', { name: 'Collapse sidebar' })).toBeNull();

    await user.click(within(sheet).getByRole('link', { name: 'Members' }));

    expect(router.state.location.pathname).toBe('/app/settings/members');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument();
    });
  });
});

describe('Sidebar collapse', () => {
  it('folds into a rail of icons with the button, and remembers it', async () => {
    const { user } = renderShell();
    const sidebar = desktopSidebar();

    const collapse = within(sidebar).getByRole('button', { name: 'Collapse sidebar' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await user.click(collapse);

    expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    const expand = within(sidebar).getByRole('button', { name: 'Expand sidebar' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(JSON.parse(localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? '{}')).toMatchObject({
      state: { collapsed: true },
    });

    // The rail keeps every page, named for screen readers, without the labels on show.
    const forms = within(sidebar).getByRole('link', { name: 'Forms' });
    expect(forms).toHaveTextContent('');
    expect(within(sidebar).queryByText('Workspace')).not.toBeInTheDocument();

    await user.click(expand);
    expect(sidebar).not.toHaveAttribute('data-collapsed');
    expect(within(sidebar).getByRole('link', { name: 'Forms' })).toHaveTextContent('Forms');
  });

  it('names each icon in a tooltip in the rail', async () => {
    useSidebarStore.setState({ collapsed: true });
    const { user } = renderShell();

    await user.hover(within(desktopSidebar()).getByRole('link', { name: 'Members' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Members');
  });

  it('starts collapsed when it was left that way', () => {
    useSidebarStore.setState({ collapsed: true });
    renderShell();
    expect(desktopSidebar()).toHaveAttribute('data-collapsed', 'true');
  });

  it('toggles with the [ key', async () => {
    const { user } = renderShell();

    // "[[" is how user-event types one "[".
    await user.keyboard('[[');
    expect(desktopSidebar()).toHaveAttribute('data-collapsed', 'true');
    await user.keyboard('[[');
    expect(desktopSidebar()).not.toHaveAttribute('data-collapsed');
  });

  it('leaves [ alone while typing', async () => {
    const { user } = renderShell('/app/notes');
    const notes = screen.getByRole('textbox', { name: 'Notes' });
    expect(notes).toHaveFocus();

    await user.keyboard('[[');

    expect(notes).toHaveValue('[');
    expect(desktopSidebar()).not.toHaveAttribute('data-collapsed');
  });

  it('follows the remembered state from another tab', () => {
    renderShell();
    act(() => {
      useSidebarStore.getState().setCollapsed(true);
    });
    expect(desktopSidebar()).toHaveAttribute('data-collapsed', 'true');
  });
});

describe('UserMenu', () => {
  it('shows who is signed in', () => {
    renderShell();

    const trigger = within(desktopSidebar()).getByRole('button', {
      name: 'Account menu for Ada Lovelace',
    });
    expect(trigger).toHaveTextContent('AL');
    expect(trigger).toHaveTextContent('ada@example.com');
  });

  it('offers the profile, appearance and keyboard shortcuts', async () => {
    const { user } = renderShell();

    await user.click(screen.getByRole('button', { name: 'Account menu for Ada Lovelace' }));

    expect(await screen.findByRole('menuitem', { name: 'Profile' })).toHaveAttribute(
      'href',
      '/app/settings',
    );
    expect(screen.getByRole('menuitem', { name: 'Appearance' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Keyboard shortcuts' }));
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Collapse or open the sidebar')).toBeInTheDocument();
  });

  it('logs out, clears the session and returns to the log-in page', async () => {
    const fetchMock = stubFetch(() => jsonResponse(null, 204));
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws_team' });
    const { queryClient, user } = renderShell();

    await user.click(screen.getByRole('button', { name: 'Account menu for Ada Lovelace' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }));

    expect(await screen.findByText('Log in page')).toBeInTheDocument();
    expect(queryClient.getQueryData(meQueryKey)).toBeNull();
    // The shell also asks for the plan (for its banner); the logout is among the requests.
    const [, init] = fetchMock.mock.calls.find(([url]) => url === '/api/auth/logout') ?? [];
    expect(init?.method).toBe('POST');
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
  });
});

describe('WorkspaceSwitcher', () => {
  it("lists the user's workspaces with their role, starting with the first", async () => {
    const { user } = renderShell();

    await user.click(
      screen.getByRole('button', { name: "Switch workspace, current workspace: Ada's workspace" }),
    );

    const items = await screen.findAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual([
      "AAda's workspaceOwner",
      'AAnalytical EnginesEditor',
    ]);
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('switches and remembers the active workspace', async () => {
    const { user } = renderShell();

    await user.click(screen.getByRole('button', { name: /^Switch workspace/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: /Analytical Engines/ }));

    expect(
      await screen.findByRole('button', {
        name: 'Switch workspace, current workspace: Analytical Engines',
      }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toContain('ws_team');
  });

  it('ignores a remembered workspace the user no longer belongs to', () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws_removed' });
    renderShell();

    expect(
      screen.getByRole('button', { name: "Switch workspace, current workspace: Ada's workspace" }),
    ).toBeInTheDocument();
  });
});
