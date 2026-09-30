import { createField, type FormDetail, type MeResponse } from '@formyx/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { EditorPage } from './editor-page';
import { makeFormDetail } from './test-utils';

interface FakeServer {
  form: FormDetail;
  patches: unknown[];
  /** The next PATCH answers 409, as if someone else saved first. */
  conflictNext: boolean;
}

function installFakeServer(form: FormDetail): FakeServer {
  const server: FakeServer = { form, patches: [], conflictNext: false };
  stubFetch((url, init) => {
    if (init.method === 'PATCH') {
      const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as {
        title: string;
        draftSchema: FormDetail['draftSchema'];
      };
      server.patches.push(body);
      if (server.conflictNext) {
        server.conflictNext = false;
        return jsonResponse({ error: { code: 'CONFLICT', message: 'Changed elsewhere' } }, 409);
      }
      server.form = {
        ...server.form,
        title: body.title,
        draftSchema: body.draftSchema,
        version: server.form.version + 1,
      };
      return jsonResponse(server.form);
    }
    if (url.startsWith('/api/forms/')) return jsonResponse(server.form);
    return jsonResponse({ forms: [] });
  });
  return server;
}

function renderEditorPage(me: MeResponse = ADA) {
  const router = createMemoryRouter(
    [
      {
        path: 'app',
        element: <ProtectedRoute />,
        children: [
          { path: 'forms', element: <p>All forms page</p> },
          { path: 'forms/:formId', element: <p>Read-only form page</p> },
          { path: 'forms/:formId/edit', element: <EditorPage /> },
        ],
      },
    ],
    { initialEntries: ['/app/forms/form_1/edit'] },
  );
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(me));
  return { router, user: userEvent.setup() };
}

describe('EditorPage', () => {
  it('autosaves a moment after changes stop, then shows Saved', async () => {
    const server = installFakeServer(makeFormDetail([createField('short_text')]));
    const { user } = renderEditorPage();

    const title = await screen.findByRole('textbox', { name: 'Form title' });
    await user.clear(title);
    await user.type(title, 'Onboarding');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    expect(await screen.findByText('Saved', {}, { timeout: 3000 })).toBeInTheDocument();
    // Typing the title was one burst of changes, so it was sent once.
    expect(server.patches).toHaveLength(1);
    expect(server.patches[0]).toMatchObject({ version: 1, title: 'Onboarding' });
    expect(server.form.version).toBe(2);
  });

  it('offers to load the latest version after a conflict', async () => {
    const server = installFakeServer(makeFormDetail());
    server.conflictNext = true;
    const { user } = renderEditorPage();

    await user.click(await screen.findByRole('button', { name: 'Add email' }));

    const dialog = await screen.findByRole(
      'alertdialog',
      { name: 'This form was changed somewhere else' },
      { timeout: 3000 },
    );
    // Behind the modal dialog, so hidden from assistive technology until it closes.
    expect(screen.getByRole('button', { name: 'Reload', hidden: true })).toBeInTheDocument();

    server.form = { ...server.form, title: 'Their title', version: 5 };
    await user.click(screen.getByRole('button', { name: 'Load latest version' }));

    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });
    expect(screen.getByRole('textbox', { name: 'Form title' })).toHaveValue('Their title');
    expect(screen.getByText('This form has no questions yet')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('saves before leaving the editor', async () => {
    const server = installFakeServer(makeFormDetail());
    const { user, router } = renderEditorPage();

    await user.click(await screen.findByRole('button', { name: 'Add date' }));
    await user.click(screen.getByRole('link', { name: 'Back to all forms' }));

    expect(await screen.findByText('All forms page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app/forms');
    expect(server.patches).toHaveLength(1);
  });

  it('sends viewers to the read-only page', async () => {
    installFakeServer(makeFormDetail());
    const viewer: MeResponse = {
      ...ADA,
      workspaces: [{ id: 'ws_personal', name: 'Shared', slug: 'shared', role: 'VIEWER' }],
    };
    renderEditorPage(viewer);

    expect(await screen.findByText('Read-only form page')).toBeInTheDocument();
  });

  it('explains when the form does not exist', async () => {
    stubFetch(() => jsonResponse({ error: { code: 'NOT_FOUND', message: 'Form not found' } }, 404));
    renderEditorPage();

    expect(await screen.findByText('Form not found')).toBeInTheDocument();
  });
});
