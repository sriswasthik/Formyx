import type { CreateFormInput, FormListItem, FormListResponse } from '@formyx/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { ApiRequestError } from '@/lib/api';
import {
  filtersFromKey,
  formKeys,
  insertForm,
  optimisticCopy,
  removeForm,
  toListItem,
  upsertForm,
} from './form-list-cache';
import {
  createForm,
  deleteForm,
  duplicateForm,
  getForm,
  listForms,
  updateForm,
  type FormFilters,
} from './forms-api';

/**
 * A workspace's forms, all of them by default: the dashboard filters, counts and sorts them
 * itself, and the sidebar and command palette share the same list.
 */
export function useFormsList(workspaceId: string, filters: FormFilters = {}) {
  return useQuery({
    queryKey: formKeys.list(workspaceId, filters),
    queryFn: () => listForms(workspaceId, filters),
    enabled: workspaceId !== '',
    // While a new search or filter loads, keep showing this workspace's previous results.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === workspaceId ? previous : undefined,
  });
}

export function useFormDetail(formId: string) {
  return useQuery({ queryKey: formKeys.detail(formId), queryFn: () => getForm(formId) });
}

/** Title and description for a toast about a failed change. */
export function describeError(error: unknown): { title?: string; description: string } {
  if (error instanceof ApiRequestError) {
    if (error.status === 409) {
      return {
        title: 'This form was changed somewhere else',
        description: 'The list now shows the latest version. Try again.',
      };
    }
    if (error.code === 'NETWORK_ERROR') {
      return { description: 'Check your connection and try again.' };
    }
    if (error.status === 403 || error.status === 404) return { description: error.message };
  }
  return { description: 'Something went wrong. Please try again.' };
}

function notifyFailure(title: string, error: unknown) {
  const described = describeError(error);
  toast.error(described.title ?? title, { description: described.description });
}

/** Optimistic edits to every cached list of one workspace's forms, whatever its filters. */
function useFormListCache(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMemo(() => {
    const queryKey = formKeys.lists(workspaceId);
    type Snapshot = [readonly unknown[], FormListResponse | undefined][];

    return {
      /** Stops in-flight fetches (so they cannot overwrite the optimistic state) and saves every list. */
      async snapshot(): Promise<Snapshot> {
        await queryClient.cancelQueries({ queryKey });
        return queryClient.getQueriesData<FormListResponse>({ queryKey });
      },
      update(change: (forms: FormListItem[], filters: FormFilters) => FormListItem[]) {
        for (const [key, list] of queryClient.getQueriesData<FormListResponse>({ queryKey })) {
          if (list) {
            queryClient.setQueryData(key, {
              ...list,
              forms: change(list.forms, filtersFromKey(key)),
            });
          }
        }
      },
      restore(snapshot: Snapshot) {
        for (const [key, forms] of snapshot) queryClient.setQueryData(key, forms);
      },
      refresh() {
        return queryClient.invalidateQueries({ queryKey });
      },
    };
  }, [queryClient, workspaceId]);
}

export function useCreateForm(workspaceId: string) {
  const queryClient = useQueryClient();
  const lists = useFormListCache(workspaceId);

  return useMutation({
    mutationFn: (input: CreateFormInput) => createForm(workspaceId, input),
    onSuccess: (form) => {
      queryClient.setQueryData(formKeys.detail(form.id), form);
      lists.update((forms, filters) => insertForm(forms, toListItem(form), filters));
      void lists.refresh();
    },
  });
}

export function useRenameForm(workspaceId: string) {
  const queryClient = useQueryClient();
  const lists = useFormListCache(workspaceId);

  return useMutation({
    mutationFn: ({ form, title }: { form: FormListItem; title: string }) =>
      updateForm(form.id, { version: form.version, title }),
    onMutate: async ({ form, title }) => {
      const snapshot = await lists.snapshot();
      const renamed = { ...form, title, updatedAt: new Date().toISOString() };
      lists.update((forms, filters) => upsertForm(forms, form.id, renamed, filters));
      return { snapshot };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(formKeys.detail(updated.id), updated);
      lists.update((forms, filters) =>
        upsertForm(
          forms,
          updated.id,
          toListItem(
            updated,
            forms.find((form) => form.id === updated.id),
          ),
          filters,
        ),
      );
    },
    onError: (error, _input, context) => {
      if (context) lists.restore(context.snapshot);
      notifyFailure('Could not rename the form', error);
    },
    onSettled: () => lists.refresh(),
  });
}

export function useDuplicateForm(workspaceId: string) {
  const queryClient = useQueryClient();
  const lists = useFormListCache(workspaceId);

  return useMutation({
    mutationFn: (form: FormListItem) => duplicateForm(form.id),
    onMutate: async (form) => {
      const snapshot = await lists.snapshot();
      const placeholder = optimisticCopy(form);
      lists.update((forms, filters) => insertForm(forms, placeholder, filters));
      return { snapshot, placeholderId: placeholder.id };
    },
    onSuccess: (created, _form, context) => {
      queryClient.setQueryData(formKeys.detail(created.id), created);
      lists.update((forms, filters) =>
        upsertForm(forms, context.placeholderId, toListItem(created), filters),
      );
    },
    onError: (error, _form, context) => {
      if (context) lists.restore(context.snapshot);
      notifyFailure('Could not duplicate the form', error);
    },
    onSettled: () => lists.refresh(),
  });
}

export function useDeleteForm(workspaceId: string) {
  const queryClient = useQueryClient();
  const lists = useFormListCache(workspaceId);

  return useMutation({
    mutationFn: (form: FormListItem) => deleteForm(form.id),
    onMutate: async (form) => {
      const snapshot = await lists.snapshot();
      lists.update((forms) => removeForm(forms, form.id));
      return { snapshot };
    },
    onSuccess: (_result, form) => {
      queryClient.removeQueries({ queryKey: formKeys.detail(form.id) });
      toast.success(`Deleted "${form.title}"`);
    },
    onError: (error, _form, context) => {
      if (context) lists.restore(context.snapshot);
      notifyFailure('Could not delete the form', error);
    },
    onSettled: () => lists.refresh(),
  });
}
