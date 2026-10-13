import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { noteAttribution, readAttribution } from '@/lib/attribution';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { SignupPage } from './signup-page';

function renderSignup() {
  renderWithProviders(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
    createTestQueryClient(null),
  );
  return userEvent.setup();
}

describe('signing up through a referral link or the badge', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('says who invited them, and sends the code and source with the sign-up', async () => {
    noteAttribution('?ref=badge');
    noteAttribution('?ref=K7MQ2XPA');
    const registered: unknown[] = [];
    stubFetch((url, init) => {
      if (url.endsWith('/public/referrals/K7MQ2XPA')) {
        return jsonResponse({ referrerName: 'Grace', trialDays: 60 });
      }
      registered.push(JSON.parse(typeof init.body === 'string' ? init.body : '{}'));
      return jsonResponse(ADA, 201);
    });
    const user = renderSignup();

    expect(await screen.findByText(/Grace invited you/)).toHaveTextContent(
      'Your account starts with 60 days of Pro, free.',
    );
    await user.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: /Create account/ }));

    await waitFor(() => {
      expect(registered).toEqual([
        {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'correct horse battery',
          referralCode: 'K7MQ2XPA',
          source: 'badge',
        },
      ]);
    });
    expect(readAttribution()).toBeNull();
  });

  it('shows nothing for a code that is not real', async () => {
    noteAttribution('?ref=K7MQ2XPA');
    let looked = false;
    stubFetch(() => {
      looked = true;
      return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not valid' } }, 404);
    });
    renderSignup();
    await waitFor(() => {
      expect(looked).toBe(true);
    });
    expect(screen.queryByText(/invited you/)).not.toBeInTheDocument();
  });
});
