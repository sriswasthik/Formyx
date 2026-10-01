import type { Webhook, WebhookDelivery } from '@formyx/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { deliveryLabel, deliveryOutcome, formatDuration } from './delivery-format';
import { WebhooksSheet } from './webhooks-sheet';

const SECRET = 'whsec_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

function delivery(overrides: Partial<WebhookDelivery> = {}): WebhookDelivery {
  return {
    id: 'del_1',
    event: 'test',
    attempt: 1,
    succeeded: true,
    statusCode: 200,
    durationMs: 84,
    error: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function hook(overrides: Partial<Webhook> = {}): Webhook {
  return {
    id: 'wh_1',
    url: 'https://hooks.example.com/formyx',
    createdAt: '2026-10-01T09:00:00.000Z',
    lastDelivery: null,
    ...overrides,
  };
}

interface Request {
  method: string;
  path: string;
  body: unknown;
}

/** A webhooks API for form_1 that starts with `initial`. */
function serve(
  initial: Webhook[] = [],
  {
    add,
    test = () => jsonResponse(delivery()),
    deliveries = [delivery()],
  }: { add?: () => Response; test?: () => Response; deliveries?: WebhookDelivery[] } = {},
) {
  let webhooks = initial;
  const requests: Request[] = [];
  stubFetch((path, init) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    requests.push({ method, path, body });
    if (path === '/api/forms/form_1/webhooks' && method === 'GET')
      return jsonResponse({ webhooks });
    if (path === '/api/forms/form_1/webhooks' && method === 'POST') {
      if (add) return add();
      const created = hook({ url: (body as { url: string }).url });
      webhooks = [...webhooks, created];
      return jsonResponse({ webhook: created, secret: SECRET }, 201);
    }
    if (path.endsWith('/test')) return test();
    if (path.endsWith('/deliveries')) return jsonResponse({ deliveries });
    if (method === 'DELETE') {
      webhooks = [];
      return jsonResponse(null, 204);
    }
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  });
  return requests;
}

function renderSheet() {
  renderWithProviders(
    <WebhooksSheet formId="form_1" open onOpenChange={() => undefined} />,
    createTestQueryClient(null),
  );
  return userEvent.setup();
}

describe('WebhooksSheet', () => {
  it('adds a webhook and shows its secret once, ready to copy', async () => {
    const requests = serve();
    const user = renderSheet();

    expect(await screen.findByText('No webhooks yet')).toBeInTheDocument();
    await user.type(
      screen.getByRole('textbox', { name: 'Endpoint URL' }),
      'https://hooks.example.com/formyx',
    );
    await user.click(screen.getByRole('button', { name: 'Add webhook' }));

    const list = await screen.findByRole('list', { name: 'Webhooks' });
    expect(within(list).getByText('https://hooks.example.com/formyx')).toBeInTheDocument();
    expect(within(list).getByText('No deliveries yet')).toBeInTheDocument();
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/forms/form_1/webhooks',
      body: { url: 'https://hooks.example.com/formyx' },
    });

    const secret = screen.getByRole('textbox', { name: 'Signing secret' });
    expect(secret).toHaveValue(SECRET);
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await navigator.clipboard.readText()).toBe(SECRET);
    expect(screen.getByRole('status')).toHaveTextContent('Secret copied');

    await user.click(screen.getByRole('button', { name: 'I’ve saved it' }));
    expect(screen.queryByRole('textbox', { name: 'Signing secret' })).not.toBeInTheDocument();
  });

  it('shows why the server refused a URL', async () => {
    serve([], {
      add: () =>
        jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Use an https:// URL',
              details: [{ path: 'url', message: 'Use an https:// URL' }],
            },
          },
          400,
        ),
    });
    const user = renderSheet();

    const url = await screen.findByRole('textbox', { name: 'Endpoint URL' });
    await user.type(url, 'http://hooks.example.com/formyx');
    await user.click(screen.getByRole('button', { name: 'Add webhook' }));

    await waitFor(() => {
      expect(url).toHaveAccessibleDescription('Use an https:// URL');
    });
  });

  it('sends a test event and shows it in the log', async () => {
    const requests = serve([hook()], {
      deliveries: [
        delivery(),
        delivery({
          id: 'del_0',
          event: 'submission.created',
          attempt: 2,
          succeeded: false,
          statusCode: null,
          durationMs: null,
          error: 'Connection refused',
        }),
      ],
    });
    const user = renderSheet();

    await user.click(await screen.findByRole('button', { name: 'Send test event' }));

    expect(await screen.findByText('Test event delivered (200)')).toBeInTheDocument();
    expect(screen.getByText('Delivered · 200')).toBeInTheDocument();
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/forms/form_1/webhooks/wh_1/test',
      body: undefined,
    });

    const toggle = screen.getByRole('button', { name: 'Delivery log' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const log = await screen.findByRole('list', { name: 'Deliveries' });
    expect(within(log).getAllByRole('listitem')).toHaveLength(2);
    expect(within(log).getByText('Connection refused')).toBeInTheDocument();
    expect(within(log).getByText('Response, retry 1')).toBeInTheDocument();
    expect(within(log).getByText('84 ms')).toBeInTheDocument();
  });

  it('says when a test event failed', async () => {
    serve([hook()], {
      test: () => jsonResponse(delivery({ succeeded: false, statusCode: 500, durationMs: 12 })),
    });
    const user = renderSheet();

    await user.click(await screen.findByRole('button', { name: 'Send test event' }));

    expect(await screen.findByText('The test event failed')).toBeInTheDocument();
    expect(screen.getByText('Failed · 500')).toBeInTheDocument();
  });

  it('removes a webhook after asking', async () => {
    const requests = serve([hook()]);
    const user = renderSheet();

    await user.click(
      await screen.findByRole('button', {
        name: 'Remove the webhook to https://hooks.example.com/formyx',
      }),
    );
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove webhook' }),
    );

    expect(await screen.findByText('Webhook removed')).toBeInTheDocument();
    expect(screen.getByText('No webhooks yet')).toBeInTheDocument();
    expect(requests).toContainEqual({
      method: 'DELETE',
      path: '/api/forms/form_1/webhooks/wh_1',
      body: undefined,
    });
  });
});

describe('delivery formatting', () => {
  it('describes attempts the way the log shows them', () => {
    expect(deliveryOutcome(delivery())).toBe('200');
    expect(deliveryOutcome(delivery({ statusCode: null, error: 'Host not found' }))).toBe(
      'Host not found',
    );
    expect(deliveryLabel(delivery())).toBe('Test');
    expect(deliveryLabel(delivery({ event: 'submission.created', attempt: 4 }))).toBe(
      'Response, retry 3',
    );
    expect(formatDuration(84)).toBe('84 ms');
    expect(formatDuration(1430)).toBe('1.4 s');
    expect(formatDuration(null)).toBe('');
  });
});
