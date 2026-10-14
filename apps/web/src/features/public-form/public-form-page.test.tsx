import {
  createDefaultTheme,
  createDefaultLogic,
  createEmptyForm,
  createField,
  createOption,
  type PublicForm,
} from '@formyx/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSignature, stubStorageUploads } from '@/test/fake-storage';
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
    logic: createDefaultLogic('See you there!'),
  },
  theme: createDefaultTheme(),
  access: { emailStep: 'none', oneResponsePerBrowser: false, allowEdits: false, indexable: false },
};

const LOCALE = { language: 'en', dateFormat: 'auto', numberFormat: 'auto' } as const;

interface Request {
  method: string;
  path: string;
  body: unknown;
}

const VIEW_TOKEN = 'v'.repeat(32);

/** Serves `FORM` (or `load`'s answer) and records every request. */
function serve(
  options: { load?: () => Response; submit?: () => Response; sign?: () => Response } = {},
): Request[] {
  const requests: Request[] = [];
  stubFetch((path, init) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    requests.push({ method, path, body });
    if (path.endsWith('/view')) return jsonResponse({ token: VIEW_TOKEN }, 201);
    if (path.endsWith('/progress')) return new Response(null, { status: 204 });
    if (path.startsWith('/api/uploads/signature')) {
      return options.sign?.() ?? jsonResponse(fakeSignature('formyx/forms/form_1/fld_cv'));
    }
    if (path.endsWith('/submissions')) {
      return (
        options.submit?.() ??
        jsonResponse(
          { id: 'sub_1', outcome: { endScreenId: 'end_default', values: {}, quiz: null } },
          201,
        )
      );
    }
    return options.load?.() ?? jsonResponse(FORM);
  });
  return requests;
}

function renderPage(slug = FORM.slug, search = '') {
  const router = createMemoryRouter([{ path: 'f/:slug', element: <PublicFormPage /> }], {
    initialEntries: [`/f/${slug}${search}`],
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
    expect(screen.getByRole('link', { name: 'Made with Formyx' })).toHaveAttribute(
      'href',
      '/?ref=badge&form=party-abc12345',
    );
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
      // Marks this visit finished, for drop-off.
      viewToken: VIEW_TOKEN,
    });
    // How far the visit got went along the way, under the same anonymous token.
    const progress = requests.filter((request) => request.path.endsWith('/progress'));
    expect(progress.map((request) => request.body)).toContainEqual({
      token: VIEW_TOKEN,
      fieldId: guests.id,
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
      load: () =>
        jsonResponse({ status: 'closed', slug: FORM.slug, title: 'Party RSVP', locale: LOCALE }),
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

describe('PublicFormPage with a file question', () => {
  const cv = {
    ...createField('file'),
    label: 'Your CV',
    required: true,
    fileConfig: { maxSizeMb: 5, allowedTypes: ['pdf' as const] },
  };
  const JOBS: PublicForm = {
    ...FORM,
    slug: 'jobs-abc12345',
    title: 'Apply',
    schema: { ...createEmptyForm(), fields: [cv] },
  };

  async function chooseCv(sign?: () => Response) {
    const requests = serve({ load: () => jsonResponse(JOBS), ...(sign && { sign }) });
    const user = renderPage(JOBS.slug);
    await user.upload(
      await screen.findByLabelText(/Your CV/),
      new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' }),
    );
    return { requests, user };
  }

  it('uploads the file straight to storage, then sends it with the answers', async () => {
    const uploads = stubStorageUploads({ autoRespond: true });
    const { requests, user } = await chooseCv();

    await screen.findByRole('button', { name: 'Remove cv.pdf' });
    expect(requests.map((request) => request.path)).toContain(
      `/api/uploads/signature?purpose=answer&form=${JOBS.slug}&field=${cv.id}`,
    );
    expect(uploads[0]?.fields.folder).toBe('formyx/forms/form_1/fld_cv');

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByText(JOBS.schema.logic.endScreens[0]?.message ?? '');
    expect(submissionsOf(requests)[0]?.body).toMatchObject({
      answers: {
        [cv.id]: {
          url: 'https://res.cloudinary.com/formyx-test/raw/upload/v1/formyx/forms/form_1/fld_cv/stored_cv.pdf',
          publicId: 'formyx/forms/form_1/fld_cv/stored_cv.pdf',
          name: 'cv.pdf',
          size: 8,
          type: 'application/pdf',
        },
      },
    });
  });

  it('explains when uploads are not available', async () => {
    const uploads = stubStorageUploads();
    await chooseCv(() =>
      jsonResponse(
        { error: { code: 'UPLOADS_UNAVAILABLE', message: 'File uploads are not available.' } },
        503,
      ),
    );

    expect(
      await screen.findByText('File uploads aren’t available right now.', {
        selector: 'p:not([role])',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(uploads).toEqual([]);
  });
});

describe('PublicFormPage embedded in another site', () => {
  const host = { postMessage: vi.fn<(message: unknown, targetOrigin: string) => void>() };

  beforeEach(() => {
    // What index.html does for /f/:slug?embed=1, and the page around the iframe.
    document.documentElement.setAttribute('data-embed', '');
    vi.spyOn(window, 'parent', 'get').mockReturnValue(host as unknown as Window);
    host.postMessage.mockClear();
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-embed');
  });

  const messages = () => host.postMessage.mock.calls.map(([message]) => message);

  it('shows the badge in the frame and reports its height to the host only', async () => {
    serve();
    renderPage(FORM.slug, '?embed=1&parent=https%3A%2F%2Fshop.example');

    await screen.findByRole('heading', { level: 1, name: 'Party RSVP' });
    // The badge opens Formyx in a new tab, never inside the host's frame.
    const badge = screen.getByRole('link', { name: 'Made with Formyx (opens in a new tab)' });
    expect(badge).toHaveAttribute(
      'href',
      `${window.location.origin}/?ref=badge&form=party-abc12345`,
    );
    expect(badge).toHaveAttribute('target', '_blank');
    expect(badge).toHaveAttribute('rel', 'noopener');
    await waitFor(() => {
      expect(messages()).toContainEqual(
        expect.objectContaining({ source: 'formyx', type: 'resize', title: 'Party RSVP' }),
      );
    });
    expect(
      host.postMessage.mock.calls.every(([, origin]) => origin === 'https://shop.example'),
    ).toBe(true);
  });

  it('tells the host when the response was sent', async () => {
    serve();
    const user = renderPage(FORM.slug, '?embed=1&parent=https%3A%2F%2Fshop.example');

    await user.type(await screen.findByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.click(screen.getByRole('radio', { name: 'No' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('See you there!')).toBeInTheDocument();
    expect(messages()).toContainEqual({
      source: 'formyx',
      type: 'submitted',
      slug: FORM.slug,
    });
  });
});
