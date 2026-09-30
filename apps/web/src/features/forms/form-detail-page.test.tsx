import { createDefaultTheme, getFormTemplate, type FormDetail } from '@formyx/shared';
import { screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useCurrentTitle } from '@/app/page-title';
import { ProtectedRoute } from '@/features/auth/protected-route';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { FormDetailPage } from './form-detail-page';

const FORM: FormDetail = {
  id: 'form_1',
  workspaceId: 'ws_personal',
  title: 'Summit 2026',
  slug: 'summit-2026-abc12345',
  status: 'DRAFT',
  version: 1,
  responseCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  publishedAt: null,
  draftSchema: getFormTemplate('event_registration').build(),
  publishedSchema: null,
  theme: createDefaultTheme(),
};

function Title() {
  return <p data-testid="page-title">{useCurrentTitle()}</p>;
}

function renderPage(respond: () => Response) {
  stubFetch(respond);
  const router = createMemoryRouter(
    [
      {
        path: 'app',
        element: <ProtectedRoute />,
        children: [
          {
            path: 'forms/:formId',
            handle: { title: 'Form' },
            element: (
              <>
                <Title />
                <FormDetailPage />
              </>
            ),
          },
        ],
      },
    ],
    { initialEntries: ['/app/forms/form_1'] },
  );
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(ADA));
}

describe('FormDetailPage', () => {
  it("summarises the form and lists its questions, with the form's name as the title", async () => {
    renderPage(() => jsonResponse(FORM));

    const questions = await screen.findByRole('list', { name: 'Questions' });
    const items = within(questions).getAllByRole('listitem');
    expect(items).toHaveLength(9);
    const [first] = items;
    expect(first).toHaveTextContent('Full name');
    expect(first).toHaveTextContent('Short text');
    expect(first).toHaveTextContent('(required)');

    expect(screen.getByText('8 questions')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toHaveTextContent('Summit 2026');
    expect(screen.getByRole('link', { name: 'All forms' })).toHaveAttribute('href', '/app/forms');
  });

  it('explains when the form does not exist', async () => {
    renderPage(() =>
      jsonResponse({ error: { code: 'NOT_FOUND', message: 'Form not found' } }, 404),
    );

    expect(await screen.findByText('Form not found')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toHaveTextContent('Form');
  });

  it('explains when the form belongs to another workspace', async () => {
    renderPage(() =>
      jsonResponse(
        { error: { code: 'FORBIDDEN', message: 'You are not a member of this workspace' } },
        403,
      ),
    );

    expect(await screen.findByText("You don't have access to this form")).toBeInTheDocument();
  });
});
