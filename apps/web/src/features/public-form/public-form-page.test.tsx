import {
  createDefaultTheme,
  createEmptyForm,
  createField,
  createOption,
  type PublicForm,
} from '@formyx/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { PublicFormPage } from './public-form-page';

const yes = createOption('Yes');
const no = createOption('No');
const attending = {
  ...createField('single_choice'),
  label: 'Are you coming?',
  required: true,
  options: [yes, no],
};
const guests = {
  ...createField('number'),
  label: 'How many guests?',
  required: true,
  conditions: [{ sourceFieldId: attending.id, operator: 'equals' as const, value: yes.id }],
};
const name = { ...createField('short_text'), label: 'Your name', required: true };

const FORM: PublicForm = {
  status: 'open',
  slug: 'party-abc12345',
  title: 'Party RSVP',
  schema: {
    ...createEmptyForm(),
    description: 'Let us know by Friday.',
    fields: [name, attending, guests],
    settings: { ...createEmptyForm().settings, successMessage: 'See you there!' },
  },
  theme: createDefaultTheme(),
};

interface Request {
  method: string;
  path: string;
  body: unknown;
}

/** Serves `FORM` (or `load`'s answer) and records every request. */
function serve(options: { load?: () => Response; submit?: () => Response } = {}): Request[] {
  const requests: Request[] = [];
  stubFetch((path, init) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    requests.push({ method, path, body });
    if (path.endsWith('/view')) return new Response(null, { status: 204 });
    if (path.endsWith('/submissions')) {
      return options.submit?.() ?? jsonResponse({ id: 'sub_1' }, 201);
    }
    return options.load?.() ?? jsonResponse(FORM);
  });
  return requests;
}

function renderPage(slug = FORM.slug) {
  const router = createMemoryRouter([{ path: 'f/:slug', element: <PublicFormPage /> }], {
    initialEntries: [`/f/${slug}`],
  });
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(null));
  return userEvent.setup();
}

const submissionsOf = (requests: Request[]) =>
  requests.filter((request) => request.path.endsWith('/submissions'));

beforeEach(() => {
  sessionStorage.clear();
});

describe('PublicFormPage', () => {
  it('shows the published form, and counts one view per browser session', async () => {
    const requests = serve();
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Party RSVP' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Let us know by Friday.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Made with Formyx' })).toHaveAttribute('href', '/');
    await waitFor(() => {
      expect(requests.filter((request) => request.path.endsWith('/view'))).toHaveLength(1);
    });
    expect(requests[0]?.path).toBe('/api/public/forms/party-abc12345');

    // Opening the form again in the same session is not another view.
    renderPage();
    await screen.findAllByRole('heading', { level: 1, name: 'Party RSVP' });
    expect(requests.filter((request) => request.path.endsWith('/view'))).toHaveLength(1);
  });

  it('asks follow-up questions only when they apply', async () => {
    serve();
    const user = renderPage();
    await screen.findByRole('heading', { name: 'Party RSVP' });
    expect(screen.queryByRole('textbox', { name: /How many guests/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    expect(await screen.findByRole('textbox', { name: /How many guests/ })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'No' }));
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /How many guests/ })).not.toBeInTheDocument();
    });
  });

  it('checks the answers before sending, focusing the first problem', async () => {
    const requests = serve();
    const user = renderPage();
    await screen.findByRole('heading', { name: 'Party RSVP' });

    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByRole('textbox', { name: /Your name/ })).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('2 questions need your attention.');
    expect(submissionsOf(requests)).toEqual([]);
  });

  it('sends the answers with the time taken, then says thank you', async () => {
    const requests = serve();
    const user = renderPage();
    await screen.findByRole('heading', { name: 'Party RSVP' });

    await user.type(screen.getByRole('textbox', { name: /Your name/ }), ' Ada ');
    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.type(await screen.findByRole('textbox', { name: /How many guests/ }), '2');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('See you there!')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Submit another response' }),
    ).not.toBeInTheDocument();
    const [submission] = submissionsOf(requests);
    expect(submission?.method).toBe('POST');
    expect(submission?.body).toEqual({
      answers: { [name.id]: 'Ada', [attending.id]: yes.id, [guests.id]: 2 },
      completionTimeMs: expect.any(Number) as number,
    });
  });

  it('shows the problems the server found under their questions', async () => {
    serve({
      submit: () =>
        jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Some answers need your attention.',
              details: [{ path: `answers.${name.id}`, message: 'Use 40 characters or fewer' }],
            },
          },
          400,
        ),
    });
    const user = renderPage();
    await screen.findByRole('heading', { name: 'Party RSVP' });

    await user.type(screen.getByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.click(screen.getByRole('radio', { name: 'No' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    const nameInput = screen.getByRole('textbox', { name: /Your name/ });
    await waitFor(() => {
      expect(nameInput).toHaveAccessibleDescription('Use 40 characters or fewer');
    });
    expect(nameInput).toHaveFocus();
  });

  it('explains when the form closed while it was being filled in', async () => {
    serve({
      submit: () =>
        jsonResponse(
          {
            error: {
              code: 'FORM_CLOSED',
              message: 'This form is no longer accepting responses.',
              details: { title: 'Party RSVP' },
            },
          },
          410,
        ),
    });
    const user = renderPage();
    await screen.findByRole('heading', { name: 'Party RSVP' });

    await user.type(screen.getByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.click(screen.getByRole('radio', { name: 'No' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('heading', { name: 'This form is closed' })).toBeInTheDocument();
  });

  it('explains that a form does not exist', async () => {
    serve({
      load: () => jsonResponse({ error: { code: 'NOT_FOUND', message: 'Form not found' } }, 404),
    });
    renderPage('nope');

    expect(
      await screen.findByRole('heading', { level: 1, name: "This form doesn't exist" }),
    ).toBeInTheDocument();
  });

  it('explains that a form is closed, naming it', async () => {
    serve({
      load: () => jsonResponse({ status: 'closed', slug: FORM.slug, title: 'Party RSVP' }),
    });
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'This form is closed' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Party RSVP')).toBeInTheDocument();
  });

  it('offers to try again when the form could not be loaded', async () => {
    let fail = true;
    serve({
      load: () =>
        fail
          ? jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Oops' } }, 500)
          : jsonResponse(FORM),
    });
    const user = renderPage();

    expect(
      await screen.findByRole(
        'heading',
        { name: 'The form could not be loaded' },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Party RSVP' })).toBeInTheDocument();
  });
});
