import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  requestBody,
  stubFetch,
} from '@/test/session';
import { LoginForm } from './login-form';
import { meQueryKey } from './session-cache';

function renderLoginForm() {
  const queryClient = createTestQueryClient(null);
  renderWithProviders(<LoginForm />, queryClient);
  return {
    queryClient,
    user: userEvent.setup(),
    email: screen.getByLabelText('Email'),
    password: screen.getByLabelText('Password'),
    submit: screen.getByRole('button', { name: 'Log in' }),
  };
}

describe('LoginForm', () => {
  describe('validation', () => {
    it('shows an inline error for each empty field and sends nothing', async () => {
      const fetchMock = stubFetch(() => jsonResponse(ADA));
      const { user, email, password, submit } = renderLoginForm();

      await user.click(submit);

      expect(await screen.findByText('Enter your email')).toBeInTheDocument();
      expect(screen.getByText('Enter your password')).toBeInTheDocument();
      expect(email).toHaveAttribute('aria-invalid', 'true');
      expect(password).toHaveAttribute('aria-invalid', 'true');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('links each error to its field and focuses the first invalid one', async () => {
      stubFetch(() => jsonResponse(ADA));
      const { user, email, submit } = renderLoginForm();

      await user.click(submit);

      await waitFor(() => {
        expect(email).toHaveFocus();
      });
      expect(email).toHaveAccessibleDescription('Enter your email');
    });

    it('checks the email format when the field is left, and clears the error once fixed', async () => {
      const { user, email } = renderLoginForm();

      await user.type(email, 'ada@');
      expect(screen.queryByText('Enter a valid email address')).not.toBeInTheDocument();

      await user.tab();
      expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
      expect(email).toHaveAttribute('aria-invalid', 'true');

      await user.type(email, 'example.com');
      await waitFor(() => {
        expect(screen.queryByText('Enter a valid email address')).not.toBeInTheDocument();
      });
      expect(email).not.toHaveAttribute('aria-invalid');
    });

    it('does not apply the sign-up password rules when logging in', async () => {
      const fetchMock = stubFetch(() => jsonResponse(ADA));
      const { user, email, password, submit } = renderLoginForm();

      await user.type(email, 'ada@example.com');
      await user.type(password, 'short');
      await user.click(submit);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledOnce();
      });
    });
  });

  it('shows and hides the password', async () => {
    const { user, password } = renderLoginForm();
    const toggle = screen.getByRole('button', { name: 'Show password' });

    expect(password).toHaveAttribute('type', 'password');
    await user.click(toggle);
    expect(password).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(password).toHaveAttribute('type', 'password');
  });

  it('sends the normalised email and stores the session on success', async () => {
    const fetchMock = stubFetch(() => jsonResponse(ADA));
    const { user, email, password, submit, queryClient } = renderLoginForm();

    await user.type(email, '  Ada@Example.com ');
    await user.type(password, 'correct horse');
    await user.click(submit);

    await waitFor(() => {
      expect(queryClient.getQueryData(meQueryKey)).toEqual(ADA);
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/login');
    expect(requestBody(fetchMock)).toEqual({ email: 'ada@example.com', password: 'correct horse' });
  });

  it('shows a loading state while logging in', async () => {
    let respond: (response: Response) => void = () => {};
    stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    const { user, email, password, submit } = renderLoginForm();

    await user.type(email, 'ada@example.com');
    await user.type(password, 'correct horse');
    await user.click(submit);

    const pending = await screen.findByRole('button', { name: 'Logging in…' });
    expect(pending).toBeDisabled();

    respond(jsonResponse(ADA));
    expect(await screen.findByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  it('shows the server message for wrong credentials without blaming a field', async () => {
    stubFetch(() =>
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }, 401),
    );
    const { user, email, password, submit } = renderLoginForm();

    await user.type(email, 'ada@example.com');
    await user.type(password, 'wrong password');
    await user.click(submit);

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(email).not.toHaveAttribute('aria-invalid');
    expect(password).not.toHaveAttribute('aria-invalid');
  });

  it('explains network failures', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const { user, email, password, submit } = renderLoginForm();

    await user.type(email, 'ada@example.com');
    await user.type(password, 'correct horse');
    await user.click(submit);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach Formyx');
  });
});
