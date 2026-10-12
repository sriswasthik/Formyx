import { createDefaultAccountPreferences, type AccountPreferences } from '@formyx/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMotionStore } from '@/features/motion/motion-preference';
import { useThemeStore } from '@/features/theme/theme-store';
import { ADA, createTestQueryClient, jsonResponse, stubFetch } from '@/test/session';
import { accountKeys } from './account-api';
import { useAccountPreferencesSync } from './use-account-preferences';

/** Serves `stored` as the account's preferences and records what is saved. */
function serve(stored: AccountPreferences) {
  const saved: AccountPreferences[] = [];
  stubFetch((path, init) => {
    if (path === '/api/account/preferences' && init.method === 'PUT') {
      const body = JSON.parse(init.body as string) as AccountPreferences;
      saved.push(body);
      return jsonResponse(body);
    }
    return jsonResponse(stored);
  });
  return saved;
}

function renderSync() {
  const queryClient = createTestQueryClient(ADA);
  // Loaded from the (stubbed) network, as when the app opens.
  queryClient.removeQueries({ queryKey: accountKeys.preferences });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  renderHook(
    () => {
      useAccountPreferencesSync();
    },
    { wrapper },
  );
  return queryClient;
}

describe('useAccountPreferencesSync', () => {
  beforeEach(() => {
    useThemeStore.setState({ preference: 'system' });
    useMotionStore.setState({ preference: 'system' });
  });
  afterEach(() => {
    delete document.documentElement.dataset.motion;
  });

  it("applies the account's look and motion when the app opens", async () => {
    const saved = serve({
      ...createDefaultAccountPreferences(),
      theme: 'dark',
      reducedMotion: 'reduce',
    });
    renderSync();

    await waitFor(() => {
      expect(useThemeStore.getState().preference).toBe('dark');
    });
    expect(useMotionStore.getState().preference).toBe('reduce');
    expect(document.documentElement.dataset.motion).toBe('reduce');
    expect(saved).toEqual([]);
  });

  it("keeps this device's choice when the account never made one, and saves it", async () => {
    useThemeStore.setState({ preference: 'light' });
    const saved = serve(createDefaultAccountPreferences());
    renderSync();

    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(saved[0]).toMatchObject({ theme: 'light', reducedMotion: 'system' });
    expect(useThemeStore.getState().preference).toBe('light');
  });

  it('saves later changes to the account', async () => {
    const saved = serve(createDefaultAccountPreferences());
    const queryClient = renderSync();
    await waitFor(() => {
      expect(queryClient.getQueryData(accountKeys.preferences)).toBeDefined();
    });

    act(() => {
      useMotionStore.getState().setPreference('full');
    });

    await waitFor(() => {
      expect(saved).toEqual([expect.objectContaining({ reducedMotion: 'full', theme: 'system' })]);
    });
  });
});
