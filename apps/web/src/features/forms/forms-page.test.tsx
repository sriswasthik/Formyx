import {
  copyFormTitle,
  createDefaultTheme,
  createEmptyForm,
  type FormDetail,
  type FormSummary,
  type MeResponse,
} from '@formyx/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useParams } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ProtectedRoute } from '@/features/auth/protected-route';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { FormsPage } from './forms-page';
import { FORMS_VIEW_STORAGE_KEY, useFormsViewStore } from './view-store';

const HOUR = 3_600_000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

function makeForm(overrides: Partial<FormSummary>): FormSummary {
  return {
    id: 'form_1',
    workspaceId: 'ws_personal',
    title: 'Customer feedback',
    slug: 'customer-feedback-abc12345',
    status: 'PUBLISHED',
    version: 3,
    responseCount: 12,
    createdAt: hoursAgo(48),
    updatedAt: hoursAgo(2),
    publishedAt: hoursAgo(24),
    ...overrides,
  };
}

const FEEDBACK = makeForm({});
const REGISTRATION = makeForm({
  id: 'form_2',
  title: 'Event registration',
  slug: 'event-registration-abc12345',
  status: 'DRAFT',
  version: 1,
  responseCount: 0,
  updatedAt: hoursAgo(26),
  publishedAt: null,
});

function toDetail(form: FormSummary): FormDetail {
  return {
    ...form,
    draftSchema: createEmptyForm(),
    publishedSchema: null,
    theme: createDefaultTheme(),
  };
}

interface RecordedRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
}

/** Resolves when `open()` is called; lets a test hold requests to observe in-between states. */
function createGate() {
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** An in-memory forms API behind a stubbed `fetch`. */
function installFakeApi(initial: FormSummary[]) {
  let forms = [...initial];
  let nextId = 100;
  let readGate: Promise<void> | null = null;
  let writeGate: Promise<void> | null = null;
  let failure: { status: number; code: string; message: string } | null = null;
  let failReads = false;
  const requests: RecordedRequest[] = [];

  stubFetch(async (url, init) => {
    const method = init.method ?? 'GET';
    const { pathname, searchParams } = new URL(url, 'http://localhost');
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method, path: pathname, search: searchParams, body });

    if (method === 'GET') {
      if (readGate) await readGate;
      if (failReads) {
        return jsonResponse(
          { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
          500,
        );
      }
      const search = searchParams.get('search')?.toLowerCase() ?? '';
      const status = searchParams.get('status')?.toUpperCase();
      return jsonResponse({
        forms: forms.filter(
          (form) =>
            form.title.toLowerCase().includes(search) && (!status || form.status === status),
        ),
      });
    }

    if (writeGate) await writeGate;
    if (failure) {
      const { status, ...error } = failure;
      failure = null;
      return jsonResponse({ error }, status);
    }

    const now = new Date().toISOString();
    if (method === 'POST' && pathname.endsWith('/forms')) {
      const { templateId } = body as { templateId: string };
      const created = makeForm({
        id: `form_${nextId++}`,
        title: templateId === 'feedback_survey' ? 'Feedback survey' : 'Untitled form',
        status: 'DRAFT',
        version: 1,
        responseCount: 0,
        updatedAt: now,
        publishedAt: null,
      });
      forms = [created, ...forms];
      return jsonResponse(toDetail(created), 201);
    }

    const formId = pathname.split('/')[3] ?? '';
    const existing = forms.find((form) => form.id === formId);
    if (!existing) {
      return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Form not found' } }, 404);
    }
    if (method === 'PATCH') {
      const { title } = body as { title: string };
      const updated = { ...existing, title, version: existing.version + 1, updatedAt: now };
      forms = forms.map((form) => (form.id === formId ? updated : form));
      return jsonResponse(toDetail(updated));
    }
    if (method === 'POST' && pathname.endsWith('/duplicate')) {
      const copy: FormSummary = {
        ...existing,
        id: `form_${nextId++}`,
        title: copyFormTitle(existing.title),
        status: 'DRAFT',
        version: 1,
        responseCount: 0,
        updatedAt: now,
        publishedAt: null,
      };
      forms = [copy, ...forms];
      return jsonResponse(toDetail(copy), 201);
    }
    if (method === 'DELETE') {
      forms = forms.filter((form) => form.id !== formId);
      return jsonResponse(null, 204);
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });

  return {
    requests,
    lists: () => requests.filter((request) => request.method === 'GET'),
    writes: () => requests.filter((request) => request.method !== 'GET'),
    holdReads() {
      const gate = createGate();
      readGate = gate.promise;
      return () => {
        readGate = null;
        gate.open();
      };
    },
    holdWrites() {
      const gate = createGate();
      writeGate = gate.promise;
      return () => {
        writeGate = null;
        gate.open();
      };
    },
    failNextWrite(status: number, code: string, message: string) {
      failure = { status, code, message };
    },
    failReads(fail: boolean) {
      failReads = fail;
    },
  };
}

function OpenedForm() {
  return <p>Opened {useParams().formId}</p>;
}

function renderDashboard({
  me = ADA,
  path = '/app/forms',
}: { me?: MeResponse; path?: string } = {}) {
  const router = createMemoryRouter(
    [
      {
        path: 'app',
        element: <ProtectedRoute />,
        children: [
          { path: 'forms', element: <FormsPage /> },
          { path: 'forms/:formId', element: <OpenedForm /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(me));
  return { router, user: userEvent.setup() };
}

const findFormList = () => screen.findByRole('list', { name: 'Forms' });

function titles(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole('listitem')
    .map((item) => within(item).getByRole('heading').textContent);
}

afterEach(() => {
  useFormsViewStore.setState({ view: 'grid' });
});

describe('FormsPage: loading and states', () => {
  it('shows skeletons, then each form with its status, responses and last edit', async () => {
    const api = installFakeApi([FEEDBACK, REGISTRATION]);
    const releaseReads = api.holdReads();
    renderDashboard();

    expect(screen.getByRole('status', { name: 'Loading forms' })).toBeInTheDocument();
    releaseReads();

    const list = await findFormList();
    const [first, second] = within(list).getAllByRole('listitem');
    expect(first).toHaveTextContent('Customer feedback');
    expect(first).toHaveTextContent('Published');
    expect(first).toHaveTextContent('12 responses');
    expect(first).toHaveTextContent('Edited 2h ago');
    expect(second).toHaveTextContent('Draft');
    expect(second).toHaveTextContent('No responses');
    expect(second).toHaveTextContent('Edited 1d ago');
    expect(within(list).getByRole('link', { name: 'Customer feedback' })).toHaveAttribute(
      'href',
      '/app/forms/form_1',
    );
  });

  it('offers templates when the workspace has no forms, and opens the created form', async () => {
    const api = installFakeApi([]);
    const { router, user } = renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Create your first form' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Feedback survey/ }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/forms/form_100');
    });
    expect(api.writes()[0]?.body).toEqual({ templateId: 'feedback_survey' });
  });

  it('offers a retry when forms cannot be loaded', async () => {
    const api = installFakeApi([FEEDBACK]);
    api.failReads(true);
    const { user } = renderDashboard();

    expect(await screen.findByText('Could not load forms')).toBeInTheDocument();
    api.failReads(false);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(titles(await findFormList())).toEqual(['Customer feedback']);
  });
});

describe('FormsPage: search, filters and views', () => {
  it('searches once typing pauses and keeps the search in the URL', async () => {
    const api = installFakeApi([FEEDBACK, REGISTRATION]);
    const { router, user } = renderDashboard();
    await findFormList();

    await user.type(screen.getByRole('searchbox', { name: 'Search forms' }), 'event');

    await waitFor(() => {
      expect(titles(screen.getByRole('list', { name: 'Forms' }))).toEqual(['Event registration']);
    });
    expect(router.state.location.search).toBe('?q=event');
    // One request for the initial list and one for the finished search, none per keystroke.
    expect(api.lists().map((request) => request.search.get('search'))).toEqual([null, 'event']);
  });

  it('applies filters from the URL', async () => {
    const api = installFakeApi([FEEDBACK, REGISTRATION]);
    renderDashboard({ path: '/app/forms?status=draft' });

    expect(titles(await findFormList())).toEqual(['Event registration']);
    expect(api.lists()[0]?.search.get('status')).toBe('draft');
    expect(screen.getByRole('combobox', { name: 'Filter by status' })).toHaveTextContent('Draft');
  });

  it('says when nothing matches, and clears the filters', async () => {
    installFakeApi([FEEDBACK]);
    const { router, user } = renderDashboard({ path: '/app/forms?q=zzz&status=closed' });

    expect(await screen.findByText('No forms match your filters')).toBeInTheDocument();
    expect(screen.getByText('Nothing matches “zzz”. Try a different search.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(titles(await findFormList())).toEqual(['Customer feedback']);
    expect(router.state.location.search).toBe('');
    expect(screen.getByRole('searchbox', { name: 'Search forms' })).toHaveValue('');
  });

  it('switches between grid and list and remembers the choice', async () => {
    installFakeApi([FEEDBACK]);
    const { user } = renderDashboard();
    await findFormList();

    const listView = screen.getByRole('radio', { name: 'List view' });
    await user.click(listView);

    expect(listView).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Last edited')).toBeInTheDocument();
    expect(localStorage.getItem(FORMS_VIEW_STORAGE_KEY)).toContain('"view":"list"');
  });
});

describe('FormsPage: changing forms', () => {
  it('renames a form straight away, before the server answers', async () => {
    const api = installFakeApi([FEEDBACK, REGISTRATION]);
    const { user } = renderDashboard();
    await findFormList();
    const releaseWrites = api.holdWrites();

    await user.click(screen.getByRole('button', { name: 'Actions for Event registration' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename form' });
    const input = within(dialog).getByLabelText('Title');
    await user.clear(input);
    await user.type(input, 'Summit signup');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    // Renaming counts as an edit, so the form moves to the top.
    await waitFor(() => {
      expect(titles(screen.getByRole('list', { name: 'Forms' }))).toEqual([
        'Summit signup',
        'Customer feedback',
      ]);
    });
    expect(api.writes()[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/forms/form_2',
      body: { version: 1, title: 'Summit signup' },
    });

    releaseWrites();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Actions for Summit signup' })).toHaveFocus();
  });

  it('checks the new title before saving', async () => {
    const api = installFakeApi([FEEDBACK]);
    const { user } = renderDashboard();
    await findFormList();

    await user.click(screen.getByRole('button', { name: 'Actions for Customer feedback' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename form' });
    await user.clear(within(dialog).getByLabelText('Title'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('Enter a title')).toBeInTheDocument();
    expect(api.writes()).toEqual([]);
  });

  it('rolls a rename back when someone else changed the form first', async () => {
    const api = installFakeApi([FEEDBACK]);
    const { user } = renderDashboard();
    await findFormList();
    api.failNextWrite(409, 'CONFLICT', 'This form was changed somewhere else.');

    await user.click(screen.getByRole('button', { name: 'Actions for Customer feedback' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename form' });
    await user.clear(within(dialog).getByLabelText('Title'));
    await user.type(within(dialog).getByLabelText('Title'), 'Mine');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(titles(screen.getByRole('list', { name: 'Forms' }))).toEqual(['Customer feedback']);
    });
    // The list is fetched again so the next attempt uses the current version.
    await waitFor(() => {
      expect(api.lists()).toHaveLength(2);
    });
  });

  it('shows a duplicate straight away, then replaces it with the saved copy', async () => {
    const api = installFakeApi([FEEDBACK]);
    const { user } = renderDashboard();
    await findFormList();
    const releaseWrites = api.holdWrites();

    await user.click(screen.getByRole('button', { name: 'Actions for Customer feedback' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));

    const list = screen.getByRole('list', { name: 'Forms' });
    await waitFor(() => {
      expect(titles(list)).toEqual(['Customer feedback (copy)', 'Customer feedback']);
    });
    const pending = within(list).getAllByRole('listitem')[0];
    expect(pending?.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(pending ?? list).queryByRole('link')).not.toBeInTheDocument();

    releaseWrites();
    expect(
      await within(list).findByRole('link', { name: 'Customer feedback (copy)' }),
    ).toHaveAttribute('href', '/app/forms/form_100');
  });

  it('deletes a form after confirmation', async () => {
    const api = installFakeApi([FEEDBACK, REGISTRATION]);
    const { user } = renderDashboard();
    await findFormList();

    await user.click(screen.getByRole('button', { name: 'Actions for Customer feedback' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “Customer feedback”?' });
    expect(dialog).toHaveTextContent('its 12 responses');
    expect(api.writes()).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Delete form' }));

    await waitFor(() => {
      expect(titles(screen.getByRole('list', { name: 'Forms' }))).toEqual(['Event registration']);
    });
    expect(api.writes()[0]).toMatchObject({ method: 'DELETE', path: '/api/forms/form_1' });
  });

  it('keeps the form when deleting fails', async () => {
    const api = installFakeApi([FEEDBACK]);
    const { user } = renderDashboard();
    await findFormList();
    api.failNextWrite(403, 'FORBIDDEN', 'You need editor access to do this');

    await user.click(screen.getByRole('button', { name: 'Actions for Customer feedback' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete form' }));

    await waitFor(() => {
      expect(api.writes()).toHaveLength(1);
    });
    await waitFor(() => {
      expect(titles(screen.getByRole('list', { name: 'Forms' }))).toEqual(['Customer feedback']);
    });
  });

  it('creates a form from the New form dialog', async () => {
    const api = installFakeApi([FEEDBACK]);
    const { router, user } = renderDashboard();
    await findFormList();

    await user.click(screen.getByRole('button', { name: 'New form' }));
    const dialog = await screen.findByRole('dialog', { name: 'New form' });
    expect(within(dialog).getByRole('radio', { name: /Blank form/ })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: /Feedback survey/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Create form' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/forms/form_100');
    });
    expect(api.writes()[0]?.body).toEqual({ templateId: 'feedback_survey' });
  });
});

describe('FormsPage: viewers', () => {
  const viewer: MeResponse = {
    ...ADA,
    workspaces: [{ id: 'ws_personal', name: 'Shared', slug: 'shared', role: 'VIEWER' }],
  };

  it('can open forms but not create or change them', async () => {
    installFakeApi([FEEDBACK]);
    const { user } = renderDashboard({ me: viewer });
    await findFormList();

    expect(screen.queryByRole('button', { name: 'New form' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions for Customer feedback' }));

    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Open']);
  });

  it('are not offered templates in an empty workspace', async () => {
    installFakeApi([]);
    renderDashboard({ me: viewer });

    expect(await screen.findByRole('heading', { name: 'No forms yet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Feedback survey/ })).not.toBeInTheDocument();
  });
});
