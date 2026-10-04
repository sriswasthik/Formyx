import {
  missingFeatures,
  requiredFeatures,
  type Entitlements,
  type FormDetail,
  type MeResponse,
} from '@formyx/shared';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ProtectedRoute } from '@/features/auth/protected-route';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { EditorPage } from './editor-page';
import { setScreen } from './test-utils';

export interface FakeServer {
  form: FormDetail;
  patches: unknown[];
  /** `POST /api/forms/:id/<action>` calls, in order, e.g. `publish:2` with the version sent. */
  actions: string[];
  /** The next PATCH answers 409, as if someone else saved first. */
  conflictNext: boolean;
  /**
   * What the workspace's plan includes. Publishing checks it like the API does; without it,
   * the entitlements endpoint answers 404 and nothing is checked.
   */
  entitlements?: Entitlements;
}

function bodyOf(init: RequestInit): Record<string, unknown> {
  return JSON.parse(typeof init.body === 'string' ? init.body : '{}') as Record<string, unknown>;
}

/** Answers the editor's requests the way the API would, keeping one form in memory. */
export function installFakeServer(
  form: FormDetail,
  { entitlements }: { entitlements?: Entitlements } = {},
): FakeServer {
  const server: FakeServer = {
    form,
    patches: [],
    actions: [],
    conflictNext: false,
    ...(entitlements && { entitlements }),
  };
  stubFetch((url, init) => {
    if (init.method === 'PATCH') {
      const body = bodyOf(init) as {
        title: string;
        draftSchema: FormDetail['draftSchema'];
        theme?: FormDetail['theme'];
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
        theme: body.theme ?? server.form.theme,
        version: server.form.version + 1,
      };
      return jsonResponse(server.form);
    }

    if (url.endsWith('/entitlements')) {
      return server.entitlements
        ? jsonResponse(server.entitlements)
        : jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
    }

    const action = /^\/api\/forms\/[^/]+\/(publish|close|reopen)$/.exec(url)?.[1];
    if (init.method === 'POST' && action) {
      const version = bodyOf(init).version;
      server.actions.push(action === 'publish' ? `publish:${String(version)}` : action);
      const { form: current } = server;
      const locked =
        action === 'publish' && server.entitlements
          ? missingFeatures(server.entitlements, requiredFeatures(current.theme))
          : [];
      if (locked.length > 0) {
        return jsonResponse(
          {
            error: {
              code: 'UPGRADE_REQUIRED',
              message: 'Your plan does not include these.',
              details: { features: locked },
            },
          },
          403,
        );
      }
      if (action === 'publish') {
        server.form = {
          ...current,
          status: current.status === 'CLOSED' ? 'CLOSED' : 'PUBLISHED',
          publishedSchema: current.draftSchema,
          publishedTitle: current.title,
          publishedTheme: current.theme,
          publishedAt: new Date().toISOString(),
        };
      } else {
        server.form = { ...current, status: action === 'close' ? 'CLOSED' : 'PUBLISHED' };
      }
      return jsonResponse(server.form);
    }

    if (url.startsWith('/api/forms/')) return jsonResponse(server.form);
    return jsonResponse({ forms: [] });
  });
  return server;
}

/** The editor at `/app/forms/form_1/edit`, signed in as `me`, on a desktop screen. */
export function renderEditorPage(me: MeResponse = ADA) {
  setScreen('desktop');
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
