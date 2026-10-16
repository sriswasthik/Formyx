import {
  createDefaultLiveSettings,
  type FormDetail,
  type FormSettingsView,
  type LiveSettings,
} from '@formyx/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { makeFormDetail } from '@/features/form-editor/test-utils';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { FormSettingsPage } from './form-settings-page';

interface Request {
  method: string;
  path: string;
  body: unknown;
}

/** Serves one form and its settings, keeping what is saved, and records every change. */
function serve({ form = makeFormDetail() }: { form?: FormDetail } = {}) {
  let view: FormSettingsView = {
    settings: createDefaultLiveSettings(),
    slug: form.slug,
    hasPassword: false,
    captchaAvailable: false,
    indexingAvailable: true,
    chat: { slack: null, discord: null },
  };
  const changes: Request[] = [];
  stubFetch((path, init) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    if (method !== 'GET') changes.push({ method, path, body });
    if (path === `/api/forms/${form.id}`) return jsonResponse(form);
    if (path === `/api/forms/${form.id}/settings`) {
      if (method === 'PATCH') {
        view = { ...view, settings: { ...view.settings, ...(body as Partial<LiveSettings>) } };
      }
      return jsonResponse(view);
    }
    if (path.endsWith('/entitlements')) {
      return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not here' } }, 404);
    }
    return jsonResponse({ error: { code: 'NOT_FOUND', message: `No ${path}` } }, 404);
  });
  return changes;
}

function renderPage(path = '/app/forms/form_1/settings') {
  const router = createMemoryRouter(
    [
      {
        element: <ProtectedRoute />,
        children: [{ path: '/app/forms/:formId/settings', element: <FormSettingsPage /> }],
      },
    ],
    { initialEntries: [path] },
  );
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(ADA));
  return { router, user: userEvent.setup() };
}

describe('FormSettingsPage', () => {
  it('saves an access setting as soon as it changes, and says so', async () => {
    const changes = serve();
    const { user } = renderPage('/app/forms/form_1/settings?section=access');

    await user.click(await screen.findByRole('switch', { name: 'Changing responses' }));

    await waitFor(() => {
      expect(changes).toHaveLength(1);
    });
    expect(changes[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/forms/form_1/settings',
      body: { access: { allowEdits: true, oneResponsePer: 'off' } },
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Changing responses' })).toBeChecked();
  });

  it('says what is wrong with a typed value, and does not save it', async () => {
    const changes = serve();
    const { user } = renderPage('/app/forms/form_1/settings?section=access');

    await user.type(await screen.findByRole('textbox', { name: 'Response limit' }), 'lots');

    expect(await screen.findByText('Enter a whole number')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(changes).toEqual([]);
  });

  it('closes after a response limit once typing pauses', async () => {
    const changes = serve();
    const { user } = renderPage('/app/forms/form_1/settings?section=access');

    await user.type(await screen.findByRole('textbox', { name: 'Response limit' }), '250');

    await waitFor(() => {
      expect(changes).toHaveLength(1);
    });
    expect(changes[0]?.body).toMatchObject({ access: { responseLimit: 250 } });
  });

  it('finds a setting by search and goes to it', async () => {
    serve();
    const { router, user } = renderPage();
    await screen.findByRole('heading', { level: 2, name: 'General' });

    await user.type(screen.getByRole('combobox', { name: 'Search settings' }), 'otp');
    expect(screen.getByRole('option', { name: /One response per person/ })).toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { level: 2, name: 'Access' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?section=access&setting=one-response');
    await waitFor(() => {
      expect(document.getElementById('setting-one-response')).toHaveAttribute(
        'data-highlight',
        'true',
      );
    });
  });

  it('switches sections from the nav', async () => {
    serve();
    const { user } = renderPage();
    await screen.findByRole('heading', { level: 2, name: 'General' });

    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    await user.click(screen.getByRole('button', { name: 'Data' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Data' })).toBeInTheDocument();
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Data');
    expect(screen.getByText(/never stores respondents' IP addresses/)).toBeInTheDocument();
  });
});
