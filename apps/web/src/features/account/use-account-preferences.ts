import type { AccountPreferences } from '@formyx/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useMotionStore } from '@/features/motion/motion-preference';
import { useThemeStore } from '@/features/theme/theme-store';
import { accountKeys, getAccountPreferences, updateAccountPreferences } from './account-api';

export function useAccountPreferences() {
  return useQuery({
    queryKey: accountKeys.preferences,
    queryFn: getAccountPreferences,
    staleTime: 5 * 60_000,
  });
}

/** Saves a change to the signed-in person's preferences, showing it at once. */
export function useUpdateAccountPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AccountPreferences>) => {
      const current = queryClient.getQueryData<AccountPreferences>(accountKeys.preferences);
      if (!current) throw new Error('Preferences are still loading');
      return updateAccountPreferences({ ...current, ...patch });
    },
    onMutate: (patch) => {
      const previous = queryClient.getQueryData<AccountPreferences>(accountKeys.preferences);
      queryClient.setQueryData<AccountPreferences>(
        accountKeys.preferences,
        (current) => current && { ...current, ...patch },
      );
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(accountKeys.preferences, context.previous);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(accountKeys.preferences, saved);
    },
  });
}

/**
 * Keeps the app's look and motion in step with the account, for signed-in pages: the saved
 * choice applies when the app opens (on any device), and a change made anywhere (the theme
 * menu, the preferences page) is saved to the account.
 */
export function useAccountPreferencesSync(): void {
  const { data } = useAccountPreferences();
  const { mutate: save } = useUpdateAccountPreferences();
  const applied = useRef(false);

  // When it first loads, the account's choice applies here; but a choice made on this device
  // beats one the account never made (its default, "system"), and is saved to it instead.
  useEffect(() => {
    if (!data || applied.current) return;
    const theme = useThemeStore.getState();
    const motion = useMotionStore.getState();
    const unsaved: Partial<AccountPreferences> = {};
    if (data.theme === 'system' && theme.preference !== 'system') {
      unsaved.theme = theme.preference;
    } else if (theme.preference !== data.theme) {
      theme.setPreference(data.theme);
    }
    if (data.reducedMotion === 'system' && motion.preference !== 'system') {
      unsaved.reducedMotion = motion.preference;
    } else if (motion.preference !== data.reducedMotion) {
      motion.setPreference(data.reducedMotion);
    }
    applied.current = true;
    if (Object.keys(unsaved).length > 0) save(unsaved);
  }, [data, save]);

  // After that, changes here are saved there.
  useEffect(() => {
    const unsubscribeTheme = useThemeStore.subscribe((state, previous) => {
      if (applied.current && state.preference !== previous.preference) {
        save({ theme: state.preference });
      }
    });
    const unsubscribeMotion = useMotionStore.subscribe((state, previous) => {
      if (applied.current && state.preference !== previous.preference) {
        save({ reducedMotion: state.preference });
      }
    });
    return () => {
      unsubscribeTheme();
      unsubscribeMotion();
    };
  }, [save]);
}
