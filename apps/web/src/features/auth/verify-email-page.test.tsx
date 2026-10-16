import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { VerifyEmailPage } from './verify-email-page';

function renderPage(search: string) {
  const router = createMemoryRouter([{ path: 'verify-email', element: <VerifyEmailPage /> }], {
    initialEntries: [`/verify-email${search}`],
  });
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(null));
}

describe('VerifyEmailPage', () => {
  it('confirms the address from the link', async () => {
    const sent: unknown[] = [];
    stubFetch((_path, init) => {
      sent.push(typeof init.body === 'string' ? JSON.parse(init.body) : null);
      return new Response(null, { status: 204 });
    });
    renderPage('?token=abc.def');
    expect(
      await screen.findByRole('heading', { name: 'Your email is confirmed' }),
    ).toBeInTheDocument();
    expect(sent).toEqual([{ token: 'abc.def' }]);
  });

  it('explains a link that no longer works', async () => {
    stubFetch(() =>
      jsonResponse({ error: { code: 'BAD_REQUEST', message: 'This link has expired' } }, 400),
    );
    renderPage('?token=old');
    expect(
      await screen.findByRole('heading', { name: 'This link no longer works' }),
    ).toBeInTheDocument();
  });

  it('says so at once when the link has no token', () => {
    stubFetch(() => new Response(null, { status: 204 }));
    renderPage('');
    expect(screen.getByRole('heading', { name: 'This link no longer works' })).toBeInTheDocument();
  });
});
