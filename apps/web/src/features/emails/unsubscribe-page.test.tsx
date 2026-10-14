import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { UnsubscribePage } from './unsubscribe-page';

function renderPage() {
  const router = createMemoryRouter(
    [{ path: 'unsubscribe/:token', element: <UnsubscribePage /> }],
    {
      initialEntries: ['/unsubscribe/dXNlcl8x.signature-of-the-token'],
    },
  );
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(null));
  return userEvent.setup();
}

describe('UnsubscribePage', () => {
  it('does nothing on the visit, unsubscribes on the press, and can undo it', async () => {
    const calls: { path: string; body: unknown }[] = [];
    stubFetch((url, init) => {
      const { pathname } = new URL(url, 'http://localhost');
      calls.push({
        path: pathname,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
      });
      return Promise.resolve(jsonResponse({ productEmails: pathname.endsWith('/resubscribe') }));
    });
    const user = renderPage();

    expect(screen.getByRole('heading', { name: 'Stop tips and reminders?' })).toBeInTheDocument();
    expect(calls).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByRole('heading', { name: 'You’re unsubscribed' })).toBeInTheDocument();
    expect(calls).toEqual([
      { path: '/api/public/unsubscribe', body: { token: 'dXNlcl8x.signature-of-the-token' } },
    ]);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      await screen.findByRole('heading', { name: 'You’re subscribed again' }),
    ).toBeInTheDocument();
  });

  it('says when the link is not valid', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse({ error: { code: 'BAD_REQUEST', message: 'This link is not valid.' } }, 400),
      ),
    );
    const user = renderPage();
    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByText(/This link isn’t working/)).toBeInTheDocument();
  });
});
