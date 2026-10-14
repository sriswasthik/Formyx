import {
  resolveEntitlements,
  type BillingSummary,
  type EntitlementsMode,
  type SubscriptionSummary,
  type WorkspaceBilling,
} from '@formyx/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  requestBody,
  stubFetch,
} from '@/test/session';
import { BillingBanner } from './billing-banner';
import { BillingPage } from './billing-page';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-20T09:00:00Z');

function summary(overrides: Partial<BillingSummary> = {}): BillingSummary {
  return {
    plan: 'FREE',
    effectivePlan: 'FREE',
    planStatus: 'ACTIVE',
    trialEndsAt: null,
    graceEndsAt: null,
    complimentaryPlan: null,
    complimentaryUntil: null,
    subscription: null,
    usage: {
      periodStart: '2026-10-01T00:00:00.000Z',
      periodEnd: '2026-11-01T00:00:00.000Z',
      responses: { used: 12, limit: 100 },
      storageBytes: { used: 2048, limit: null },
    },
    downgrade: null,
    enforcement: 'soft',
    checkoutAvailable: true,
    ...overrides,
  };
}

const entitlements = (billing: Partial<WorkspaceBilling>, mode: EntitlementsMode = 'enforced') =>
  resolveEntitlements(
    { plan: 'FREE', planStatus: 'ACTIVE', trialEndsAt: null, ...billing },
    mode,
    NOW,
  );

/** The API, answering billing and entitlements; `extra` handles anything else first. */
function stubApi(
  billing: () => BillingSummary,
  ents: ReturnType<typeof entitlements>,
  extra: (path: string, init: RequestInit) => Response | undefined = () => undefined,
) {
  return stubFetch((path, init) => {
    const handled = extra(path, init);
    if (handled) return handled;
    if (path.endsWith('/entitlements')) return jsonResponse(ents);
    if (path.endsWith('/billing/payments')) return jsonResponse({ payments: [] });
    if (path.endsWith('/billing')) return jsonResponse(billing());
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  useWorkspaceStore.getState().setActiveWorkspaceId('ws_personal');
});
afterEach(() => {
  vi.useRealTimers();
});

/** `ui` on a signed-in page, as Ada. */
function render(ui: React.ReactElement) {
  const router = createMemoryRouter(
    [{ path: 'app', element: <ProtectedRoute />, children: [{ path: '*', element: ui }] }],
    { initialEntries: ['/app/settings/billing'] },
  );
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(ADA));
}

describe('BillingBanner', () => {
  it('counts down the trial, with the way to upgrade', async () => {
    stubApi(
      () => summary(),
      entitlements({
        plan: 'PRO',
        planStatus: 'TRIALING',
        trialEndsAt: new Date(NOW.getTime() + 11.5 * DAY_MS),
      }),
    );
    render(<BillingBanner />);
    expect(await screen.findByText('12 days left in your Pro trial.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/app/settings/billing',
    );
  });

  it('tells members who aren’t owners who can upgrade', async () => {
    useWorkspaceStore.getState().setActiveWorkspaceId('ws_team');
    stubApi(
      () => summary(),
      entitlements({
        plan: 'PRO',
        planStatus: 'TRIALING',
        trialEndsAt: new Date(NOW.getTime() + 3 * DAY_MS),
      }),
    );
    render(<BillingBanner />);
    expect(
      await screen.findByText('3 days left in your Pro trial. Ask a workspace owner to upgrade.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('warns about a failed payment before anything else', async () => {
    stubApi(
      () => summary({ usage: { ...summary().usage, responses: { used: 100, limit: 100 } } }),
      entitlements({
        plan: 'PRO',
        planStatus: 'PAST_DUE',
        graceEndsAt: new Date('2026-10-25T00:00:00Z'),
      }),
    );
    render(<BillingBanner />);
    expect(await screen.findByText(/The last payment didn’t go through/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check payment' })).toBeInTheDocument();
  });

  it('warns at 80% of the month’s responses', async () => {
    stubApi(
      () => summary({ usage: { ...summary().usage, responses: { used: 85, limit: 100 } } }),
      entitlements({}),
    );
    render(<BillingBanner />);
    expect(
      await screen.findByText(
        'Your forms have used 85 of the 100 responses your plan includes this period.',
      ),
    ).toBeInTheDocument();
  });

  it('stays out of the way while everything is unlocked', async () => {
    const fetchMock = stubApi(
      () => summary(),
      entitlements(
        { plan: 'PRO', planStatus: 'TRIALING', trialEndsAt: new Date(NOW.getTime() + DAY_MS) },
        'all_unlocked',
      ),
    );
    render(<BillingBanner />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole('region', { name: 'Plan' })).not.toBeInTheDocument();
  });
});

/** The index of the first request whose path ends with `suffix`. */
const requestTo = (fetchMock: ReturnType<typeof stubFetch>, suffix: string) =>
  fetchMock.mock.calls.findIndex(([url]) => typeof url === 'string' && url.endsWith(suffix));

describe('BillingPage', () => {
  const proMonthly: SubscriptionSummary = {
    id: 'sub_1',
    plan: 'PRO',
    interval: 'monthly',
    status: 'active',
    currentPeriodStart: '2026-10-12T00:00:00.000Z',
    currentPeriodEnd: '2026-11-12T00:00:00.000Z',
    cancelAtPeriodEnd: false,
  };
  const active = summary({ plan: 'PRO', effectivePlan: 'PRO', subscription: proMonthly });

  it('shows the plan, when it renews, usage and the plans', async () => {
    stubApi(() => active, entitlements({ plan: 'PRO' }));
    render(<BillingPage />);
    expect(await screen.findByText('Renews on 12 November 2026, monthly.')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Responses' })).toHaveAttribute('aria-valuenow', '12');
    expect(screen.getByText('2 KB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Your plan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Switch to Business' })).toBeEnabled();
    expect(await screen.findByText('No payments yet')).toBeInTheDocument();
  });

  it('cancels at the end of the period, with the reason if given', async () => {
    const cancelled = {
      ...active,
      subscription: { ...proMonthly, cancelAtPeriodEnd: true },
    };
    let current = active;
    const fetchMock = stubApi(
      () => current,
      entitlements({ plan: 'PRO' }),
      (path) => {
        if (!path.endsWith('/billing/cancel')) return undefined;
        current = cancelled;
        return jsonResponse(cancelled);
      },
    );
    const user = userEvent.setup();
    render(<BillingPage />);

    await user.click(await screen.findByRole('button', { name: 'Cancel plan' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel Pro?' });
    expect(within(dialog).getByText(/keeps working until 12 November 2026/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'It costs too much' }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel Pro' }));

    expect(await screen.findByText('Pro ends on 12 November 2026')).toBeInTheDocument();
    const call = requestTo(fetchMock, '/billing/cancel');
    expect(requestBody(fetchMock, call)).toEqual({ reason: 'too_expensive' });
    expect(await screen.findByRole('button', { name: 'Resume Pro' })).toBeInTheDocument();
  });

  it('buys a plan through Razorpay Checkout, checked on the server', async () => {
    let paid = false;
    const fetchMock = stubApi(
      () =>
        paid
          ? {
              ...summary({ plan: 'PRO', effectivePlan: 'PRO' }),
              subscription: { ...proMonthly, id: 'sub_new' },
            }
          : summary(),
      entitlements({}),
      (path) => {
        if (path.endsWith('/billing/subscribe')) {
          return jsonResponse(
            {
              subscriptionId: 'sub_new',
              keyId: 'rzp_test_x',
              plan: 'PRO',
              interval: 'yearly',
              amount: 299_000,
              currency: 'INR',
              prefill: { name: 'Ada', email: 'ada@example.com' },
            },
            201,
          );
        }
        if (path.endsWith('/billing/verify')) {
          paid = true;
          return jsonResponse({ status: 'confirming' });
        }
        return undefined;
      },
    );
    const opened = vi.fn();
    vi.stubGlobal(
      'Razorpay',
      class {
        constructor(
          private readonly options: {
            subscription_id: string;
            handler: (response: Record<string, string>) => void;
          },
        ) {
          opened(options);
        }
        open() {
          this.options.handler({
            razorpay_payment_id: 'pay_1',
            razorpay_subscription_id: this.options.subscription_id,
            razorpay_signature: 'a'.repeat(64),
          });
        }
      },
    );
    const user = userEvent.setup();
    render(<BillingPage />);

    await user.click(await screen.findByRole('radio', { name: /Yearly/ }));
    await user.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));

    expect(await screen.findByText('Welcome to Pro')).toBeInTheDocument();
    expect(opened).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'rzp_test_x', subscription_id: 'sub_new' }),
    );
    const subscribeCall = requestTo(fetchMock, '/subscribe');
    expect(requestBody(fetchMock, subscribeCall)).toEqual({ plan: 'PRO', interval: 'yearly' });
    const verifyCall = requestTo(fetchMock, '/verify');
    expect(requestBody(fetchMock, verifyCall)).toEqual({
      razorpayPaymentId: 'pay_1',
      razorpaySubscriptionId: 'sub_new',
      razorpaySignature: 'a'.repeat(64),
    });
  });

  it('lists what a downgrade changed', async () => {
    stubApi(
      () =>
        summary({
          downgrade: {
            from: 'PRO',
            at: '2026-10-15T00:00:00.000Z',
            forms: [
              { formId: 'f1', title: 'Launch RSVP', features: ['premium_fonts', 'google_sheets'] },
            ],
          },
        }),
      entitlements({}),
    );
    render(<BillingPage />);
    expect(await screen.findByRole('link', { name: 'Launch RSVP' })).toHaveAttribute(
      'href',
      '/app/forms/f1/edit',
    );
    expect(screen.getByText('Premium fonts, Google Sheets')).toBeInTheDocument();
  });

  it('is for owners only', () => {
    useWorkspaceStore.getState().setActiveWorkspaceId('ws_team');
    stubApi(() => summary(), entitlements({}));
    render(<BillingPage />);
    expect(screen.getByText('Billing is for workspace owners')).toBeInTheDocument();
  });
});
