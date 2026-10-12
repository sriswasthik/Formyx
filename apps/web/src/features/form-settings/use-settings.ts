import type {
  FormDetail,
  FormSettings,
  FormSettingsView,
  FormTheme,
  LiveSettings,
} from '@formyx/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getForm, updateForm } from '@/features/forms/forms-api';
import { formKeys } from '@/features/forms/form-list-cache';
import { useSaveQueue } from './save-queue-context';
import { formSettingsKey, getFormSettings, updateFormSettings } from './settings-api';

/*
 * The three kinds of settings the page changes, each saved its own way through the queue:
 *
 * - Live settings (access, notifications, autoresponder, sharing, data): in effect at once.
 * - The form's own settings (language, formats, button text, saving progress): part of the
 *   draft, so they go live with the next publish, like the questions.
 * - The look (progress bar, numbering, required marker, badge): part of the theme, also live
 *   with the next publish.
 *
 * Each change shows at once (the cached copy is updated first) and is sent after the ones
 * before it; what is sent is whatever is current when its turn comes, so the version a draft
 * write carries is always the latest.
 */

export function useFormSettingsQuery(formId: string) {
  return useQuery({ queryKey: formSettingsKey(formId), queryFn: () => getFormSettings(formId) });
}

export function useFormDetailQuery(formId: string) {
  return useQuery({ queryKey: formKeys.detail(formId), queryFn: () => getForm(formId) });
}

interface ChangeOptions {
  /** Typing: wait for a pause before saving. */
  typing?: boolean;
}

/** Changes one live section; it saves, whole, after the changes before it. */
export function useLiveSection<K extends keyof LiveSettings>(formId: string, key: K) {
  const queryClient = useQueryClient();
  const queue = useSaveQueue();

  return useCallback(
    (next: LiveSettings[K], { typing = false }: ChangeOptions = {}) => {
      const cacheKey = formSettingsKey(formId);
      queryClient.setQueryData<FormSettingsView>(
        cacheKey,
        (view) => view && { ...view, settings: { ...view.settings, [key]: next } },
      );
      // The cached copy already holds this change (and any made since), so the reply is only
      // confirmation; a failure leaves the change shown, to try again.
      const run = async () => {
        const current = queryClient.getQueryData<FormSettingsView>(cacheKey);
        if (!current) return;
        await updateFormSettings(formId, { [key]: current.settings[key] });
      };
      (typing ? queue.saveSoon : queue.save)(`live:${key}`, run);
    },
    [formId, key, queryClient, queue],
  );
}

/** Writes a draft change, at the form's current version, and keeps the reply. */
function useDraftWriter(formId: string) {
  const queryClient = useQueryClient();
  const queue = useSaveQueue();

  return useCallback(
    (
      saveKey: string,
      change: (form: FormDetail) => FormDetail,
      write: (form: FormDetail) => Parameters<typeof updateForm>[1],
      { typing = false }: ChangeOptions = {},
    ) => {
      const cacheKey = formKeys.detail(formId);
      queryClient.setQueryData<FormDetail>(cacheKey, (form) => form && change(form));
      const run = async () => {
        const current = queryClient.getQueryData<FormDetail>(cacheKey);
        if (!current) return;
        try {
          const saved = await updateForm(formId, write(current));
          // The cached copy already holds every change; it only needs the new version, which
          // the next write sends.
          queryClient.setQueryData<FormDetail>(cacheKey, (form) =>
            form ? { ...form, version: saved.version, updatedAt: saved.updatedAt } : saved,
          );
        } catch (error) {
          // Edited somewhere else (the editor, another tab): start again from the latest.
          await queryClient.invalidateQueries({ queryKey: cacheKey });
          throw error;
        }
      };
      (typing ? queue.saveSoon : queue.save)(saveKey, run);
    },
    [formId, queryClient, queue],
  );
}

/** Changes the draft's own settings; they go live with the next publish. */
export function useDraftSettings(formId: string) {
  const writeDraft = useDraftWriter(formId);
  return useCallback(
    (patch: Partial<FormSettings>, options?: ChangeOptions) => {
      const change = (form: FormDetail): FormDetail => ({
        ...form,
        draftSchema: {
          ...form.draftSchema,
          settings: { ...form.draftSchema.settings, ...patch },
        },
      });
      writeDraft(
        `draft:${Object.keys(patch).join(',')}`,
        change,
        (form) => ({ version: form.version, draftSchema: form.draftSchema }),
        options,
      );
    },
    [writeDraft],
  );
}

/** Renames the form; respondents see the new title with the next publish. */
export function useFormTitle(formId: string) {
  const writeDraft = useDraftWriter(formId);
  return useCallback(
    (title: string) => {
      writeDraft(
        'title',
        (form) => ({ ...form, title }),
        (form) => ({ version: form.version, title: form.title }),
        { typing: true },
      );
    },
    [writeDraft],
  );
}

/** Changes the look; it goes live with the next publish. */
export function useThemeSettings(formId: string) {
  const writeDraft = useDraftWriter(formId);
  return useCallback(
    (saveKey: string, update: (theme: FormTheme) => FormTheme) => {
      writeDraft(
        `theme:${saveKey}`,
        (form) => ({ ...form, theme: update(form.theme) }),
        (form) => ({ version: form.version, theme: form.theme }),
      );
    },
    [writeDraft],
  );
}
