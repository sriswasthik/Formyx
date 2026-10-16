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
import { ReportPage } from './report-page';

function renderPage() {
  const router = createMemoryRouter([{ path: 'report/:slug', element: <ReportPage /> }], {
    initialEntries: ['/report/survey-abc12345'],
  });
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(null));
  return userEvent.setup();
}

describe('ReportPage', () => {
  it('sends a reason and details, then thanks them', async () => {
    const sent: { path: string; body: unknown }[] = [];
    stubFetch((path, init) => {
      sent.push({ path, body: typeof init.body === 'string' ? JSON.parse(init.body) : null });
      return new Response(null, { status: 204 });
    });
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(screen.getByText('Choose a reason')).toBeInTheDocument();
    expect(sent).toEqual([]);

    await user.click(
      screen.getByRole('radio', { name: 'It asks for passwords, bank or card details' }),
    );
    await user.type(screen.getByRole('textbox', { name: /Anything else/ }), 'Asked for my OTP');
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    expect(
      await screen.findByRole('heading', { name: 'Thanks for telling us' }),
    ).toBeInTheDocument();
    expect(sent).toEqual([
      {
        path: '/api/public/forms/survey-abc12345/report',
        body: { reason: 'phishing', details: 'Asked for my OTP' },
      },
    ]);
  });

  it('says when the form does not exist', async () => {
    stubFetch(() => jsonResponse({ error: { code: 'NOT_FOUND', message: 'Form not found' } }, 404));
    const user = renderPage();
    await user.click(screen.getByRole('radio', { name: 'It is spam or a scam' }));
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(
      await screen.findByText('We couldn’t find that form. Check the link it came from.'),
    ).toBeInTheDocument();
  });
});
