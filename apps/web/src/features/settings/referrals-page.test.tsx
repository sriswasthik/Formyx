import type { MeResponse, ReferralSummary } from '@formyx/shared';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ProtectedRoute } from '@/features/auth/protected-route';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { Route, Routes } from 'react-router';
import { ReferralsPage } from './referrals-page';

function renderPage(me: MeResponse = ADA) {
  renderWithProviders(
    <MemoryRouter initialEntries={['/app/settings/referrals']}>
      <Routes>
        <Route path="app" element={<ProtectedRoute />}>
          <Route path="settings/referrals" element={<ReferralsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
    createTestQueryClient(me),
  );
}

const SUMMARY: ReferralSummary = {
  code: 'K7MQ2XPA',
  friends: [
    {
      name: 'Grace',
      joinedAt: '2026-10-01T10:00:00.000Z',
      rewardedAt: '2026-10-05T10:00:00.000Z',
      reward: 'complimentary',
    },
    { name: 'Linus', joinedAt: '2026-10-03T10:00:00.000Z', rewardedAt: null, reward: null },
  ],
  rewardsEarned: 1,
  rewardLimit: 12,
};

describe('ReferralsPage', () => {
  it('shows the link to share, how it works, and who joined', async () => {
    stubFetch(() => jsonResponse(SUMMARY));
    renderPage();

    expect(await screen.findByRole('textbox', { name: 'Your referral link' })).toHaveValue(
      `${window.location.origin}/?ref=K7MQ2XPA`,
    );
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toContain(
      encodeURIComponent('/?ref=K7MQ2XPA'),
    );
    expect(screen.getByText('2 joined · 1 of 12 free months earned')).toBeInTheDocument();
    const friends = screen
      .getAllByRole('listitem')
      .filter((item) => /Grace|Linus/.test(item.textContent));
    expect(friends[0]).toHaveTextContent('Paid 5 Oct 2026: you got 30 days of Pro');
    expect(friends[1]).toHaveTextContent('Joined 3 Oct 2026');
  });

  it('says when nobody has joined yet', async () => {
    stubFetch(() => jsonResponse({ ...SUMMARY, friends: [], rewardsEarned: 0 }));
    renderPage();
    expect(await screen.findByText('No one has joined with your link yet')).toBeInTheDocument();
  });

  it('offers a retry when it cannot load', async () => {
    stubFetch(() =>
      jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }, 500),
    );
    renderPage();
    expect(await screen.findByText('Could not load your referrals')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('has no link for the demo account', () => {
    renderPage({ ...ADA, user: { ...ADA.user, isDemo: true } });
    expect(screen.getByText(/The demo account has no referral link/)).toBeInTheDocument();
  });
});
