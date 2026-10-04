import { resolveEntitlements, type EntitlementsMode } from '@formyx/shared';
import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, jsonResponse, stubFetch } from '@/test/session';
import { ProBadge } from './pro-badge';
import { UpgradeDialog } from './upgrade-dialog';
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
  it('says Pro plans are coming soon and lists what the form uses', async () => {
    const onOpenChange = vi.fn();
    render(
      <UpgradeDialog
        open
        onOpenChange={onOpenChange}
        features={['mesh_gradients', 'remove_branding']}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Pro plans are coming soon' });
    expect(dialog).toHaveAccessibleDescription(/switch them to free options in Design/);
    const items = within(within(dialog).getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Mesh gradients ProSoft, many-colour backgrounds.',
      'Remove Formyx branding ProHide "Made with Formyx" under your forms.',
    ]);

    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
