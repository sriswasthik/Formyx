import {
  createDefaultTheme,
  createEmptyForm,
  type Field,
  type FormDetail,
  type FormSchema,
} from '@formyx/shared';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createEditorStore, type EditorStore } from './editor-store';
import { EditorStoreContext } from './editor-store-context';

export function makeFormDetail(
  fields: Field[] = [],
  overrides: Partial<FormDetail> = {},
): FormDetail {
  const draftSchema: FormSchema = { ...createEmptyForm(), fields };
  return {
    id: 'form_1',
    workspaceId: 'ws_personal',
    title: 'Customer survey',
    slug: 'customer-survey-abc12345',
    status: 'DRAFT',
    version: 1,
    responseCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
    draftSchema,
    publishedSchema: null,
    theme: createDefaultTheme(),
    ...overrides,
  };
}

/** Renders `ui` with an editor store for `form`, inside a router and tooltip provider. */
export function renderWithEditor(ui: React.ReactElement, form: FormDetail = makeFormDetail()) {
  const store: EditorStore = createEditorStore({
    title: form.title,
    schema: form.draftSchema,
    version: form.version,
  });
  const router = createMemoryRouter(
    [
      {
        path: '/app/forms/:formId/edit',
        element: (
          <EditorStoreContext.Provider value={store}>
            <TooltipProvider>{ui}</TooltipProvider>
          </EditorStoreContext.Provider>
        ),
      },
      { path: '/app/forms', element: <p>All forms</p> },
    ],
    { initialEntries: [`/app/forms/${form.id}/edit`] },
  );
  const result = render(<RouterProvider router={router} />);
  return { ...result, store, router, user: userEvent.setup() };
}
