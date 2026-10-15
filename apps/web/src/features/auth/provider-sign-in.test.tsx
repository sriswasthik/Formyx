import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { noteAttribution } from '@/lib/attribution';
import {
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { fetchMe } from './auth-api';
import { ProviderSignIn } from './provider-sign-in';
import { hasSessionHint, providerSignInFailed, setSessionHint } from './session-cache';

function renderButtons(
  providers: string[],
  { url = '/login', state }: { url?: string; state?: unknown } = {},
) {
  const fetchMock = stubFetch((path) =>
    path.endsWith('/auth/providers')
      ? jsonResponse({ providers })
      : jsonResponse({ error: { code: 'NOT_FOUND', message: 'Nope' } }, 404),
  );
  const { pathname, search } = new URL(url, 'https://formyx.test');
  renderWithProviders(
    <MemoryRouter initialEntries={[{ pathname, search, state }]}>
      <ProviderSignIn page={pathname === '/signup' ? 'signup' : 'login'} />
    </MemoryRouter>,
    createTestQueryClient(null),
  );
  return { user: userEvent.setup(), fetchMock };
}

/** Clicks a provider's button without jsdom trying to follow the link. */
async function startSignIn(user: ReturnType<typeof userEvent.setup>, name: string) {
  const link = await screen.findByRole('link', { name });
  link.addEventListener('click', (event) => {
    event.preventDefault();
  });
  await user.click(link);
  return link;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('ProviderSignIn', () => {
  it('offers each provider the server is set up for, as a link to the API', async () => {
    renderButtons(['google', 'zoho'], { state: { from: '/invite/abc' } });

    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/api/auth/oauth/google?page=login&next=%2Finvite%2Fabc',
    );
    expect(screen.getByRole('link', { name: 'Continue with Zoho' })).toHaveAttribute(
      'href',
      '/api/auth/oauth/zoho?page=login&next=%2Finvite%2Fabc',
    );
    expect(screen.getByText('or', { exact: true })).toBeInTheDocument();
  });

  it('carries the referral code and source, for a new account', async () => {
    noteAttribution('?ref=badge');
    noteAttribution('?ref=K7MQ2XPA');
    renderButtons(['google'], { url: '/signup' });

    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/api/auth/oauth/google?page=signup&next=%2Fapp&ref=K7MQ2XPA&source=badge',
    );
  });

  it('shows nothing when the server offers no providers', async () => {
    const { fetchMock } = renderButtons([]);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    // The placeholder goes once the answer is in.
    await waitFor(() => {
      expect(document.querySelector('[class*="animate-pulse"]')).toBeNull();
    });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('or', { exact: true })).not.toBeInTheDocument();
  });

  it('says why the last sign-in did not work', async () => {
    renderButtons(['zoho'], { url: '/login?sign_in_error=unverified_email&provider=zoho' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email already exists, and Zoho has not confirmed the address is yours.',
    );
  });

  it('marks the browser as signing in before it leaves', async () => {
    const { user } = renderButtons(['google']);
    const link = await startSignIn(user, 'Continue with Google');

    expect(hasSessionHint()).toBe(true);
    expect(link).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('coming back from a provider', () => {
  it('knows a sign-in failed, once', async () => {
    const { user } = renderButtons(['google']);
    await startSignIn(user, 'Continue with Google');

    expect(providerSignInFailed('?sign_in_error=cancelled&provider=google')).toBe(true);
    // A later page load is an ordinary one.
    expect(providerSignInFailed('?sign_in_error=cancelled')).toBe(false);
  });

  it('keeps the hint when it worked', async () => {
    const { user } = renderButtons(['google']);
    await startSignIn(user, 'Continue with Google');

    expect(providerSignInFailed('')).toBe(false);
    expect(hasSessionHint()).toBe(true);
  });

  it('never asks the API about the session after a failed sign-in', async () => {
    setSessionHint(true);
    sessionStorage.setItem('formyx-provider-sign-in', '1');
    window.history.replaceState(null, '', '/login?sign_in_error=failed');
    const fetchMock = stubFetch(() => jsonResponse({}, 401));
    try {
      expect(await fetchMe()).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(hasSessionHint()).toBe(false);
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});
