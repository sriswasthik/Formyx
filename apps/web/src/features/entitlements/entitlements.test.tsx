import {
  resolveEntitlements,
  type BillingSummary,
  type EntitlementsMode,
  type FeatureId,
} from '@formyx/shared';
import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';
import {
  ADA,
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { ProBadge } from './pro-badge';
import { UpgradeDialog } from './upgrade-dialog';
import { useUpgradeStore } from './upgrade-store';
import {
  describeEntitlements,
  UNKNOWN_ENTITLEMENTS,
  useWorkspaceEntitlements,
} from './use-entitlements';

const freePlan = (mode: EntitlementsMode) =>
  resolveEntitlements({ plan: 'FREE', planStatus: 'ACTIVE', trialEndsAt: null }, mode);

describe('describeEntitlements', () => {
  it('answers from the plan when enforced', () => {
    const free = describeEntitlements(freePlan('enforced'));
    expect(free.enforced).toBe(true);
    expect(free.hasFeature('mesh_gradients')).toBe(false);
    expect(free.getLimit('responses_per_month')).toBe(100);
    expect(free.missing(['remove_branding', 'premium_fonts'])).toEqual([
      'premium_fonts',
      'remove_branding',
    ]);
  });

  it('includes everything while unlocked', () => {
    const unlocked = describeEntitlements(freePlan('all_unlocked'));
    expect(unlocked.enforced).toBe(false);
    expect(unlocked.hasFeature('ai_insights')).toBe(true);
    expect(unlocked.missing(['ai_insights'])).toEqual([]);
  });

  it('holds nothing back while unknown: the API has the last word', () => {
    expect(UNKNOWN_ENTITLEMENTS.hasFeature('mesh_gradients')).toBe(true);
    expect(UNKNOWN_ENTITLEMENTS.missing(['mesh_gradients'])).toEqual([]);
    expect(UNKNOWN_ENTITLEMENTS.getLimit('responses_per_month')).toBeNull();
  });
});

describe('useWorkspaceEntitlements', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
  }

  it('asks the API about the workspace', async () => {
    const fetchMock = stubFetch(() => jsonResponse(freePlan('enforced')));
    const { result } = renderHook(() => useWorkspaceEntitlements('ws_1'), { wrapper });

    await waitFor(() => {
      expect(result.current.entitlements).toBeDefined();
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/workspaces/ws_1/entitlements');
    expect(result.current.hasFeature('custom_shapes')).toBe(false);
  });

  it('waits for a workspace', () => {
    const fetchMock = stubFetch(() => jsonResponse(freePlan('enforced')));
    const { result } = renderHook(() => useWorkspaceEntitlements(undefined), { wrapper });
    expect(result.current.entitlements).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ProBadge', () => {
  it('says Pro', () => {
    render(<ProBadge />);
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });
});

describe('UpgradeDialog', () => {
  /** The dialog on a signed-in page, as Ada, in the workspace `workspaceId`. */
  function renderDialog(
    features: FeatureId[],
    { workspaceId = 'ws_personal', checkoutAvailable = true } = {},
  ) {
    useWorkspaceStore.getState().setActiveWorkspaceId(workspaceId);
    stubFetch((path) =>
      path.endsWith('/billing')
        ? jsonResponse({
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
              responses: { used: 0, limit: 100 },
              storageBytes: { used: 0, limit: null },
            },
            downgrade: null,
            enforcement: 'soft',
            checkoutAvailable,
          } satisfies BillingSummary)
        : jsonResponse(freePlan('enforced')),
    );
    const onOpenChange = vi.fn();
    const router = createMemoryRouter(
      [
        {
          path: 'app',
          element: <ProtectedRoute />,
          children: [
            {
              path: '*',
              element: <UpgradeDialog open onOpenChange={onOpenChange} features={features} />,
            },
          ],
        },
      ],
      { initialEntries: ['/app/forms'] },
    );
    renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(ADA));
    return onOpenChange;
  }

  it('lists what the form uses, and the plan that includes it', async () => {
    const onOpenChange = renderDialog(['mesh_gradients', 'remove_branding']);

    const dialog = screen.getByRole('dialog', { name: 'Upgrade to Pro' });
    expect(dialog).toHaveAccessibleDescription(/publishing them takes Pro/);
    const items = within(within(dialog).getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Mesh gradients ProSoft, many-colour backgrounds.',
      'Remove Formyx branding ProHide "Made with Formyx" under your forms.',
    ]);
    expect(within(dialog).getByText('₹299')).toBeInTheDocument();
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Upgrade to Pro' })).toBeEnabled();
    });

    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Not now' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('asks for Business when a feature needs it', () => {
    renderDialog(['ai_insights']);
    expect(screen.getByRole('dialog', { name: 'Upgrade to Business' })).toBeInTheDocument();
  });

  it('sends members who aren’t owners to an owner', () => {
    renderDialog(['mesh_gradients'], { workspaceId: 'ws_team' });
    const dialog = screen.getByRole('dialog', { name: 'Upgrade to Pro' });
    expect(
      within(dialog).getByText(/Only a workspace owner can change the plan/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Upgrade to Pro' })).toBeNull();
  });

  it('says when payments aren’t set up', async () => {
    renderDialog(['mesh_gradients'], { checkoutAvailable: false });
    expect(
      await screen.findByText('Payments aren’t set up on this server yet.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade to Pro' })).toBeDisabled();
  });
});

describe('ProBadge for a feature', () => {
  it('opens the upgrade dialog', async () => {
    render(<ProBadge feature="quiz_mode" />);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Quizzes is a Pro feature: see plans' }));
    expect(useUpgradeStore.getState().features).toEqual(['quiz_mode']);
    useUpgradeStore.getState().closeUpgrade();
  });
});
