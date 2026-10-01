import type {
  AnalyticsRange,
  FormDetail,
  FormSummary,
  NotificationSettings,
  SubmissionRecord,
} from '@formyx/shared';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { formKeys } from '@/features/forms/form-list-cache';
import { describeError } from '@/features/forms/use-forms';
import { currentTimeZone } from './format';
import {
  adjustResponseCount,
  removeResponses,
  responseKeys,
  type ResponsePages,
} from './response-cache';
import {
  deleteResponses,
  getAnalytics,
  getNotificationSettings,
  getResponse,
  listResponses,
  updateNotificationSettings,
  type ResponseFilters,
} from './responses-api';

export function useResponsesList(formId: string, filters: ResponseFilters) {
  return useInfiniteQuery({
    queryKey: responseKeys.list(formId, filters),
    queryFn: ({ pageParam }) => listResponses(formId, filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    // While a new search loads, keep showing the last results rather than a skeleton.
    placeholderData: keepPreviousData,
  });
}

/** A response already in some loaded page, so the sheet can open without waiting. */
function findLoadedResponse(
  queryClient: QueryClient,
  formId: string,
  responseId: string,
): SubmissionRecord | undefined {
  for (const [, data] of queryClient.getQueriesData<ResponsePages>({
    queryKey: responseKeys.lists(formId),
  })) {
    for (const page of data?.pages ?? []) {
      const found = page.submissions.find((submission) => submission.id === responseId);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * One response. `active: false` keeps what is cached on screen without fetching it again,
 * e.g. while a closing sheet slides away from a response that was just deleted.
 */
export function useResponse(formId: string, responseId: string | null, active = true) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: responseKeys.detail(formId, responseId ?? ''),
    queryFn: () => getResponse(formId, responseId ?? ''),
    enabled: active && responseId !== null,
    initialData: () =>
      responseId ? findLoadedResponse(queryClient, formId, responseId) : undefined,
  });
}

export function useAnalytics(formId: string, range: AnalyticsRange) {
  const timeZone = currentTimeZone();
  return useQuery({
    queryKey: responseKeys.analyticsFor(formId, range, timeZone),
    queryFn: () => getAnalytics(formId, range, timeZone),
    // Switching range keeps the last chart on screen (dimmed) until the new one arrives.
    placeholderData: keepPreviousData,
  });
}

/** Moves a form's response count in the cached form and every cached list of its workspace. */
export function adjustCachedResponseCount(
  queryClient: QueryClient,
  form: Pick<FormDetail, 'id' | 'workspaceId'>,
  delta: number,
): void {
  queryClient.setQueryData<FormDetail>(formKeys.detail(form.id), (current) =>
    current ? adjustResponseCount(current, delta) : current,
  );
  queryClient.setQueriesData<FormSummary[]>(
    { queryKey: formKeys.lists(form.workspaceId) },
    (forms) =>
      forms?.map((summary) =>
        summary.id === form.id ? adjustResponseCount(summary, delta) : summary,
      ),
  );
}

/** Removes responses from every cached list of the form. */
export function removeCachedResponses(
  queryClient: QueryClient,
  formId: string,
  ids: readonly string[],
): void {
  const gone = new Set(ids);
  queryClient.setQueriesData<ResponsePages>({ queryKey: responseKeys.lists(formId) }, (data) =>
    data ? removeResponses(data, gone) : data,
  );
  // Only responses nobody is looking at: removing one an open sheet still watches would make
  // it fetch the response again, which is gone. The sheet is closing anyway.
  for (const id of ids) {
    queryClient.removeQueries({ queryKey: responseKeys.detail(formId, id), type: 'inactive' });
  }
}

export function useDeleteResponses(form: Pick<FormDetail, 'id' | 'workspaceId'>) {
  const queryClient = useQueryClient();
  const lists = responseKeys.lists(form.id);

  return useMutation({
    mutationFn: (ids: readonly string[]) => deleteResponses(form.id, ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: lists });
      const snapshot = queryClient.getQueriesData<ResponsePages>({ queryKey: lists });
      removeCachedResponses(queryClient, form.id, ids);
      return { snapshot };
    },
    onSuccess: (deleted) => {
      adjustCachedResponseCount(queryClient, form, -deleted);
      toast.success(deleted === 1 ? 'Response deleted' : `${deleted} responses deleted`);
    },
    onError: (error, ids, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      const described = describeError(error);
      toast.error(
        described.title ??
          (ids.length === 1 ? 'Could not delete the response' : 'Could not delete the responses'),
        { description: described.description },
      );
    },
    // Totals, analytics and the form's count all follow from the server's view.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: lists }),
        queryClient.invalidateQueries({ queryKey: responseKeys.analytics(form.id) }),
        queryClient.invalidateQueries({ queryKey: formKeys.detail(form.id), exact: true }),
      ]),
  });
}

export function useNotificationSettings(formId: string) {
  return useQuery({
    queryKey: responseKeys.notifications(formId),
    queryFn: () => getNotificationSettings(formId),
  });
}

export function useUpdateNotificationSettings(formId: string) {
  const queryClient = useQueryClient();
  const key = responseKeys.notifications(formId);

  return useMutation({
    mutationFn: (settings: NotificationSettings) => updateNotificationSettings(formId, settings),
    onMutate: async (settings) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationSettings>(key);
      queryClient.setQueryData(key, settings);
      return { previous };
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(key, settings);
      toast.success(
        settings.emailOnSubmission
          ? "We'll email you about new responses"
          : 'Emails about new responses are off',
      );
    },
    onError: (error, _settings, context) => {
      queryClient.setQueryData(key, context?.previous);
      toast.error('Could not change your email setting', {
        description: describeError(error).description,
      });
    },
  });
}
