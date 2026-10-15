import {
  createDefaultLogic,
  createDefaultTheme,
  createEmptyForm,
  createField,
  type PublicForm,
} from '@formyx/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { PublicFormPage } from './public-form-page';

/*
 * Sprint 21 on the public page: forms that are unavailable, the report link, and the
 * Turnstile spam check.
 */

const name = { ...createField('short_text'), label: 'Your name', required: true };

const FORM: PublicForm = {
  status: 'open',
  slug: 'survey-abc12345',
  title: 'Customer survey',
  schema: { ...createEmptyForm(), fields: [name], logic: createDefaultLogic('Thanks!') },
  theme: createDefaultTheme(),
  access: { emailStep: 'none', oneResponsePerBrowser: false, allowEdits: false, indexable: false },
};

const LOCALE = { language: 'en', dateFormat: 'auto', numberFormat: 'auto' } as const;

function serve(load: unknown, submit?: () => Response) {
  const sent: unknown[] = [];
  stubFetch((path, init) => {
    if (path.endsWith('/view')) return jsonResponse({ token: 'v'.repeat(32) }, 201);
    if (path.endsWith('/progress')) return new Response(null, { status: 204 });
    if (path.endsWith('/submissions')) {
      sent.push(typeof init.body === 'string' ? JSON.parse(init.body) : undefined);
      return (
        submit?.() ??
        jsonResponse(
          { id: 's', outcome: { endScreenId: 'end_default', values: {}, quiz: null } },
          201,
        )
      );
    }
    return jsonResponse(load);
  });
  return sent;
}

function renderPage() {
  const router = createMemoryRouter([{ path: 'f/:slug', element: <PublicFormPage /> }], {
    initialEntries: [`/f/${FORM.slug}`],
  });
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(null));
  return userEvent.setup();
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  delete window.turnstile;
});

describe('a form that is unavailable', () => {
  it('says so, without its title', async () => {
    serve({ status: 'unavailable', slug: FORM.slug, locale: LOCALE });
    renderPage();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'This form is unavailable' }),
    ).toBeInTheDocument();
    expect(screen.getByText('It can’t be opened right now.')).toBeInTheDocument();
    expect(document.title).not.toContain('Customer survey');
  });
});

describe('the report link', () => {
  it('sits under every form, in a new tab, even when the badge is hidden', async () => {
    const theme = createDefaultTheme();
    serve({
      ...FORM,
      theme: { ...theme, branding: { ...theme.branding, showFormyxBadge: false } },
    });
    renderPage();
    const link = await screen.findByRole('link', { name: 'Report this form (opens in a new tab)' });
    expect(link).toHaveAttribute('href', `${window.location.origin}/report/${FORM.slug}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('link', { name: 'Made with Formyx' })).not.toBeInTheDocument();
  });
});

describe('the spam check', () => {
  /** Cloudflare's script, stubbed: hands out "token-1" when the widget is drawn. */
  function stubTurnstile() {
    const reset = vi.fn();
    window.turnstile = {
      render: (_element, options) => {
        options.callback('token-1');
        return 'widget-1';
      },
      reset,
      remove: vi.fn(),
    };
    return { reset };
  }

  const withCheck = { ...FORM, access: { ...FORM.access, captchaSiteKey: 'site-key' } };

  it("sends Turnstile's token with the response", async () => {
    stubTurnstile();
    const sent = serve(withCheck);
    const user = renderPage();
    await user.type(await screen.findByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Thanks!')).toBeInTheDocument();
    expect(sent[0]).toMatchObject({ captchaToken: 'token-1' });
  });

  it('asks again when the check did not pass', async () => {
    const { reset } = stubTurnstile();
    serve(withCheck, () =>
      jsonResponse(
        { error: { code: 'CAPTCHA_FAILED', message: 'Confirm you’re not a robot' } },
        403,
      ),
    );
    const user = renderPage();
    await user.type(await screen.findByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(
      await screen.findByText('Confirm you’re not a robot, then send again.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(reset).toHaveBeenCalledWith('widget-1');
    });
  });

  it('is not loaded for forms without it', async () => {
    const sent = serve(FORM);
    const user = renderPage();
    await user.type(await screen.findByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByText('Thanks!');
    expect(sent[0]).not.toHaveProperty('captchaToken');
    expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
  });
});
