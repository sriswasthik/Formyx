import type { FormAnalytics, FormDetail } from '@formyx/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { formKeys } from '@/features/forms/form-list-cache';
import { useArrivals } from '../arrivals-store';
import {
  addResponse,
  addResponseToAnalytics,
  canPlaceNewResponse,
  filtersFromKey,
  replaceResponse,
  responseKeys,
  type ResponsePages,
} from '../response-cache';
import { adjustCachedResponseCount, removeCachedResponses } from '../use-responses';
import {
  realtimeClient,
  type FormListener,
  type LiveStatus,
  type RealtimeClient,
} from './realtime-client';

/**
 * Live analytics are updated in place, but views are not part of a response event, so the
 * server's numbers are fetched again once arrivals settle down.
 */
const RECONCILE_AFTER_MS = 3000;

export function useLiveStatus(client: RealtimeClient = realtimeClient): LiveStatus {
  return useSyncExternalStore(client.onStatusChange, client.getStatus, () => 'offline');
}

/**
 * Keeps a form's cached responses, analytics and counts up to date as responses arrive or
 * are deleted elsewhere, and returns the connection's status.
 */
export function useLiveResponses(
  form: Pick<FormDetail, 'id' | 'workspaceId'>,
  client: RealtimeClient = realtimeClient,
): LiveStatus {
  const queryClient = useQueryClient();
  const arrive = useArrivals((state) => state.arrive);
  const reconcileTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { id: formId, workspaceId } = form;

  useEffect(() => {
    const reconcileSoon = () => {
      clearTimeout(reconcileTimer.current);
      reconcileTimer.current = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: responseKeys.analytics(formId) });
      }, RECONCILE_AFTER_MS);
    };

    const listener: FormListener = {
      onCreated: ({ submission }) => {
        for (const [key, data] of queryClient.getQueriesData<ResponsePages>({
          queryKey: responseKeys.lists(formId),
        })) {
          const filters = filtersFromKey(key);
          if (!data || !filters) continue;
          if (canPlaceNewResponse(filters)) {
            queryClient.setQueryData(key, addResponse(data, filters, submission));
          } else {
            void queryClient.invalidateQueries({ queryKey: key, exact: true });
          }
        }
        queryClient.setQueriesData<FormAnalytics>(
          { queryKey: responseKeys.analytics(formId) },
          (analytics) => (analytics ? addResponseToAnalytics(analytics, submission) : analytics),
        );
        adjustCachedResponseCount(queryClient, { id: formId, workspaceId }, 1);
        arrive(submission.id);
        reconcileSoon();
      },

      onUpdated: ({ submission }) => {
        queryClient.setQueriesData<ResponsePages>(
          { queryKey: responseKeys.lists(formId) },
          (data) => (data ? replaceResponse(data, submission) : data),
        );
        queryClient.setQueryData(responseKeys.detail(formId, submission.id), submission);
        // Searches and answer filters may now match differently, and the summary has moved.
        for (const [key] of queryClient.getQueriesData<ResponsePages>({
          queryKey: responseKeys.lists(formId),
        })) {
          const filters = filtersFromKey(key);
          if (filters && (filters.search || filters.answered)) {
            void queryClient.invalidateQueries({ queryKey: key, exact: true });
          }
        }
        reconcileSoon();
      },

      onDeleted: ({ ids }) => {
        removeCachedResponses(queryClient, formId, ids);
        // Lists and analytics only: the deleted responses themselves are gone for good.
        void queryClient.invalidateQueries({ queryKey: responseKeys.lists(formId) });
        void queryClient.invalidateQueries({ queryKey: responseKeys.analytics(formId) });
        void queryClient.invalidateQueries({ queryKey: formKeys.detail(formId), exact: true });
      },

      onResync: () => {
        void queryClient.invalidateQueries({ queryKey: responseKeys.all(formId) });
        void queryClient.invalidateQueries({ queryKey: formKeys.detail(formId), exact: true });
      },
    };

    const unsubscribe = client.subscribe(formId, listener);
    return () => {
      unsubscribe();
      clearTimeout(reconcileTimer.current);
    };
  }, [arrive, client, formId, queryClient, workspaceId]);

  return useLiveStatus(client);
}
