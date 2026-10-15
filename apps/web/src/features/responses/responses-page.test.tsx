import {
  addSubmissionToSummaries,
  createDefaultTheme,
  createQuestionSummaries,
  getFormTemplate,
  type FormAnalytics,
  type FormDetail,
  type MeResponse,
  type SubmissionCreatedEvent,
  type SubmissionRecord,
} from '@formyx/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { setScreen } from '@/features/form-editor/test-utils';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  requestBody,
  stubFetch,
} from '@/test/session';
import type * as RealtimeModule from './realtime/realtime-client';
import type { FormListener } from './realtime/realtime-client';
import { ResponsesPage } from './responses-page';

/** The live connection, driven by the tests: they deliver events as the server would. */
const live = vi.hoisted(() => {
  const listeners = new Map<string, FormListener>();
  return {
    listeners,
    client: {
      subscribe: (formId: string, listener: FormListener) => {
        listeners.set(formId, listener);
        return () => {
          listeners.delete(formId);
        };
      },
      getStatus: () => 'live' as const,
      onStatusChange: () => () => undefined,
    },
  };
});

vi.mock('./realtime/realtime-client', async (importOriginal) => ({
  ...(await importOriginal<typeof RealtimeModule>()),
  realtimeClient: live.client,
}));

const schema = getFormTemplate('feedback_survey').build();
const [satisfaction, recommend, likes, better, features, followUp, email] = schema.fields;
if (!satisfaction || !recommend || !likes || !better || !features || !followUp || !email) {
  throw new Error('The feedback template changed');
}
const option = (field: typeof features, label: string) =>
  'options' in field
    ? (field.options.find((candidate) => candidate.label === label)?.id ?? '')
    : '';

const FORM: FormDetail = {
  id: 'form_1',
  workspaceId: 'ws_personal',
  title: 'Product feedback',
  slug: 'product-feedback-abc12345',
  status: 'PUBLISHED',
  version: 2,
  responseCount: 2,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  publishedAt: '2026-09-01T09:00:00.000Z',
  draftSchema: schema,
  publishedSchema: schema,
  publishedTitle: 'Product feedback',
  theme: createDefaultTheme(),
  publishedTheme: createDefaultTheme(),
  review: null,
};

function response(id: string, createdAt: string, answers: SubmissionRecord['answers']) {
  return {
    id,
    createdAt,
    completionTimeMs: 90_000,
    answers,
    metadata: { userAgent: 'Firefox', referrer: null },
    outcome: null,
  } satisfies SubmissionRecord;
}

const NEWER = response('sub_2', new Date(Date.now() - 60 * 60 * 1000).toISOString(), {
  [satisfaction.id]: 5,
  [recommend.id]: 9,
  [likes.id]: 'Fast and calm',
  [features.id]: [option(features, 'Form builder'), option(features, 'Analytics')],
  [followUp.id]: option(followUp, 'No'),
});
const OLDER = response('sub_1', new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), {
  [satisfaction.id]: 3,
  [recommend.id]: 6,
  [better.id]: 'More templates',
  [followUp.id]: option(followUp, 'Yes'),
  [email.id]: 'ada@example.com',
});

function analytics(): FormAnalytics {
  const questions = createQuestionSummaries(schema);
  for (const submission of [OLDER, NEWER]) addSubmissionToSummaries(questions, submission);
  const today = new Date();
  return {
    totals: { views: 8, responses: 2, timedResponses: 2, totalCompletionTimeMs: 180_000 },
    responsesPerDay: {
      range: '30d',
      timeZone: 'UTC',
      days: Array.from({ length: 30 }, (_, index) => ({
        date: new Date(today.getTime() - (29 - index) * 86_400_000).toISOString().slice(0, 10),
        responses: index === 29 ? 2 : 0,
      })),
    },
    questions,
    dropOff: {
      unit: 'question',
      started: 8,
      steps: [
        { key: 'q1', label: 'Satisfaction', reached: 8 },
        { key: 'q2', label: 'Recommend', reached: 5 },
        { key: 'q3', label: 'Better', reached: 4 },
      ],
      completed: 2,
    },
  };
}

const VIEWER: MeResponse = {
  ...ADA,
  workspaces: [{ id: 'ws_personal', name: 'Shared', slug: 'shared', role: 'VIEWER' }],
};

function bodyOf(init: RequestInit): unknown {
  return JSON.parse(typeof init.body === 'string' ? init.body : 'null');
}

function installApi(form: FormDetail = FORM) {
  let rows = [NEWER, OLDER];
  const fetchMock = stubFetch((url, init) => {
    const method = init.method ?? 'GET';
    if (url === '/api/forms/form_1') return jsonResponse(form);
    if (url.startsWith('/api/forms/form_1/analytics')) return jsonResponse(analytics());
    if (url === '/api/forms/form_1/notifications') {
      return jsonResponse(method === 'PUT' ? bodyOf(init) : { emailOnSubmission: false });
    }
    if (url === '/api/forms/form_1/submissions/bulk-delete') {
      const { ids } = bodyOf(init) as { ids: string[] };
      rows = rows.filter((row) => !ids.includes(row.id));
      return jsonResponse({ deleted: ids.length });
    }
    const single = /^\/api\/forms\/form_1\/submissions\/([^/?]+)$/.exec(url)?.[1];
    if (single) {
      if (method === 'DELETE') {
        rows = rows.filter((row) => row.id !== single);
        return jsonResponse(null, 204);
      }
      const found = rows.find((row) => row.id === single);
      return found
        ? jsonResponse(found)
        : jsonResponse({ error: { code: 'NOT_FOUND', message: 'Response not found' } }, 404);
    }
    if (url.startsWith('/api/forms/form_1/submissions')) {
      return jsonResponse({ submissions: rows, nextCursor: null, total: rows.length });
    }
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  });
  return {
    fetchMock,
    /** Someone else deletes a response, as far as this page is concerned. */
    deleteElsewhere: (id: string) => {
      rows = rows.filter((row) => row.id !== id);
    },
  };
}

function renderPage({ me = ADA, path = '/app/forms/form_1/responses' } = {}) {
  setScreen('desktop');
  const router = createMemoryRouter(
    [
      {
        path: 'app',
        element: <ProtectedRoute />,
        children: [
          { path: 'forms/:formId/responses', element: <ResponsesPage /> },
          { path: 'forms/:formId/edit', element: <p>Editor</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  const queryClient = createTestQueryClient(me);
  renderWithProviders(<RouterProvider router={router} />, queryClient);
  return { router, queryClient, user: userEvent.setup() };
}

// The chart loads lazily in the app. Loading it here, once, keeps the cost of compiling Recharts
// out of the tests' own time limits; under a full, parallel run that can take a while.
const CHART_IMPORT_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  await import('./summary/per-day-area-chart');
}, CHART_IMPORT_TIMEOUT_MS);

beforeEach(() => {
  live.listeners.clear();
});

/** The page's live listener for form_1, once it has subscribed. */
function liveListener(): FormListener {
  const listener = live.listeners.get('form_1');
  if (!listener) throw new Error('The page is not following form_1');
  return listener;
}

describe('ResponsesPage: summary', () => {
  it('shows the totals, responses per day and a summary of each question', async () => {
    installApi();
    renderPage();

    const totals = await screen.findByRole('region', { name: 'Totals' });
    expect(within(totals).getByText('Views').nextSibling).toHaveTextContent('8');
    expect(within(totals).getByText('Completion rate').nextSibling).toHaveTextContent('25%');
    expect(within(totals).getByText('Average time').nextSibling).toHaveTextContent('1m 30s');

    expect(screen.getByRole('table', { name: 'Responses per day' })).toBeInTheDocument();
    expect(screen.getByText('2 responses in the last 30 days')).toBeInTheDocument();

    const rating = screen.getByRole('region', { name: /Overall, how satisfied/ });
    expect(within(rating).getByText('4')).toBeInTheDocument();
    expect(within(rating).getByText('average out of 5')).toBeInTheDocument();
    const choice = screen.getByRole('region', { name: /Which features/ });
    expect(within(choice).getByText(/more than 100%/)).toBeInTheDocument();
    const text = screen.getByRole('region', { name: /What do you like most/ });
    expect(within(text).getByText('Fast and calm')).toBeInTheDocument();
    expect(within(text).getByRole('link', { name: /View the answer/ })).toHaveAttribute(
      'href',
      `/app/forms/form_1/responses?tab=responses&answered=${likes.id}`,
    );
  });

  it("asks editors to publish first when the form isn't published", async () => {
    installApi({ ...FORM, status: 'DRAFT', publishedSchema: null, responseCount: 0 });
    renderPage();

    expect(await screen.findByText("This form isn't published yet")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the editor' })).toHaveAttribute(
      'href',
      '/app/forms/form_1/edit',
    );
  });
});

describe('ResponsesPage: responses', () => {
  it('lists responses with a column per question, and opens one in full', async () => {
    installApi();
    const { user } = renderPage({ path: '/app/forms/form_1/responses?tab=responses' });

    const table = await screen.findByRole('table');
    expect(
      within(table).getByRole('columnheader', { name: /What do you like most/ }),
    ).toBeInTheDocument();
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const [, newest] = rows;
    if (!newest) throw new Error('No rows');
    expect(within(newest).getByText('5 / 5')).toBeInTheDocument();
    expect(within(newest).getByText('Form builder, Analytics')).toBeInTheDocument();

    const [open] = within(table).getAllByRole('button', { name: /^Open the response/ });
    if (!open) throw new Error('No response to open');
    await user.click(open);

    const sheet = await screen.findByRole('dialog', { name: 'Response' });
    expect(within(sheet).getByText('Fast and calm')).toBeInTheDocument();
    expect(within(sheet).getByText('Form builder')).toBeInTheDocument();
    expect(within(sheet).getByText('1m 30s')).toBeInTheDocument();
  });

  it('deletes the selected responses once confirmed', async () => {
    const { fetchMock } = installApi();
    const { user } = renderPage({ path: '/app/forms/form_1/responses?tab=responses' });

    await user.click(await screen.findByRole('checkbox', { name: 'Select all loaded responses' }));
    const bar = screen.getByRole('region', { name: 'Selected responses' });
    expect(within(bar).getByText('2 selected')).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 responses?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete 2 responses' }));

    expect(await screen.findByText('2 responses deleted')).toBeInTheDocument();
    const call = fetchMock.mock.calls.findIndex(
      ([input]) => typeof input === 'string' && input.endsWith('/bulk-delete'),
    );
    expect(requestBody(fetchMock, call)).toEqual({ ids: ['sub_2', 'sub_1'] });
    expect(await screen.findByText('No responses yet')).toBeInTheDocument();
  });

  it('keeps keyboard focus on a checkbox when it is ticked', async () => {
    installApi();
    const { user } = renderPage({ path: '/app/forms/form_1/responses?tab=responses' });

    const [first] = await screen.findAllByRole('checkbox', { name: /^Select the response/ });
    if (!first) throw new Error('No response to select');
    first.focus();
    await user.keyboard(' ');

    expect(first).toBeChecked();
    expect(first).toHaveFocus();
  });

  it('lets viewers read responses, but not select or delete them', async () => {
    installApi();
    const { user } = renderPage({ me: VIEWER, path: '/app/forms/form_1/responses?tab=responses' });

    await screen.findByRole('table');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Overview/ })).toHaveAttribute(
      'href',
      '/app/forms/form_1',
    );
    const [open] = screen.getAllByRole('button', { name: /^Open the response/ });
    if (!open) throw new Error('No response to open');
    await user.click(open);

    const sheet = await screen.findByRole('dialog', { name: 'Response' });
    expect(await within(sheet).findByText('Fast and calm')).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('button', { name: 'Delete response' }),
    ).not.toBeInTheDocument();
  });

  it('adds responses as they arrive, and counts them', async () => {
    installApi();
    renderPage({ path: '/app/forms/form_1/responses?tab=responses' });
    await screen.findByRole('table');
    expect(screen.getByRole('tab', { name: /Responses/ })).toHaveTextContent('2');

    const arriving: SubmissionCreatedEvent = {
      formId: 'form_1',
      submission: response('sub_3', new Date().toISOString(), { [likes.id]: 'Just in' }),
    };
    liveListener().onCreated(arriving);

    expect(await screen.findByText('Just in')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getByRole('tab', { name: /Responses/ })).toHaveTextContent('3');
    expect(screen.getByText('A new response arrived.')).toBeInTheDocument();
  });

  it('shows a response as its respondent changes it', async () => {
    installApi();
    renderPage({ path: '/app/forms/form_1/responses?tab=responses' });
    await screen.findByText('Fast and calm');

    liveListener().onUpdated({
      formId: 'form_1',
      submission: {
        ...response('sub_2', new Date().toISOString(), { [likes.id]: 'Calm, and now quick' }),
        editedAt: new Date().toISOString(),
      },
    });

    expect(await screen.findByText('Calm, and now quick')).toBeInTheDocument();
    expect(screen.queryByText('Fast and calm')).not.toBeInTheDocument();
  });

  it('removes responses that someone else deletes', async () => {
    const api = installApi();
    renderPage({ path: '/app/forms/form_1/responses?tab=responses' });
    await screen.findByText('Fast and calm');

    api.deleteElsewhere('sub_2');
    liveListener().onDeleted({ formId: 'form_1', ids: ['sub_2'] });

    await waitFor(() => {
      expect(screen.queryByText('Fast and calm')).not.toBeInTheDocument();
    });
  });
});

describe('ResponsesPage: notifications', () => {
  it('turns emails about new responses on for the signed-in member', async () => {
    const { fetchMock } = installApi();
    const { user } = renderPage();

    const toggle = await screen.findByRole('switch', { name: 'Email me on new responses' });
    await waitFor(() => {
      expect(toggle).toBeEnabled();
    });
    await user.click(toggle);

    expect(await screen.findByText("We'll email you about new responses")).toBeInTheDocument();
    expect(toggle).toBeChecked();
    const call = fetchMock.mock.calls.findIndex(([, init]) => init?.method === 'PUT');
    expect(requestBody(fetchMock, call)).toEqual({ emailOnSubmission: true });
  });
});
