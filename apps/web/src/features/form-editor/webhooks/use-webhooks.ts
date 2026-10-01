import {
  createdWebhookSchema,
  webhookDeliveriesSchema,
  webhookDeliverySchema,
  webhooksResponseSchema,
  type CreatedWebhook,
  type Webhook,
  type WebhookDelivery,
} from '@formyx/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

const webhooksPath = (formId: string) => `/forms/${encodeURIComponent(formId)}/webhooks`;
const webhookPath = (formId: string, webhookId: string) =>
  `${webhooksPath(formId)}/${encodeURIComponent(webhookId)}`;

export const webhookKeys = {
  list: (formId: string) => ['forms', formId, 'webhooks'] as const,
  deliveries: (formId: string, webhookId: string) =>
    ['forms', formId, 'webhooks', webhookId, 'deliveries'] as const,
};

/** Checks back now and then while the log is open, so real responses show up. */
const LOG_REFRESH_MS = 10_000;

export function useWebhooks(formId: string) {
  return useQuery({
    queryKey: webhookKeys.list(formId),
    queryFn: async () => (await apiRequest(webhooksPath(formId), webhooksResponseSchema)).webhooks,
  });
}

export function useDeliveries(formId: string, webhookId: string) {
  return useQuery({
    queryKey: webhookKeys.deliveries(formId, webhookId),
    queryFn: async () =>
      (await apiRequest(`${webhookPath(formId, webhookId)}/deliveries`, webhookDeliveriesSchema))
        .deliveries,
    refetchInterval: LOG_REFRESH_MS,
  });
}

export function useAddWebhook(formId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string): Promise<CreatedWebhook> =>
      apiRequest(webhooksPath(formId), createdWebhookSchema, jsonRequest('POST', { url })),
    onSuccess: ({ webhook }) => {
      queryClient.setQueryData<Webhook[]>(webhookKeys.list(formId), (webhooks = []) => [
        ...webhooks,
        webhook,
      ]);
    },
  });
}

export function useRemoveWebhook(formId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (webhookId: string) => {
      await apiRequest(webhookPath(formId, webhookId), z.undefined(), { method: 'DELETE' });
    },
    onSuccess: (_result, webhookId) => {
      queryClient.setQueryData<Webhook[]>(webhookKeys.list(formId), (webhooks) =>
        webhooks?.filter((webhook) => webhook.id !== webhookId),
      );
      queryClient.removeQueries({ queryKey: webhookKeys.deliveries(formId, webhookId) });
    },
  });
}

/** Sends a test event now; the attempt joins the log and becomes the latest delivery. */
export function useSendTestEvent(formId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (webhookId: string): Promise<WebhookDelivery> =>
      apiRequest(`${webhookPath(formId, webhookId)}/test`, webhookDeliverySchema, {
        method: 'POST',
      }),
    onSuccess: (delivery, webhookId) => {
      queryClient.setQueryData<WebhookDelivery[]>(
        webhookKeys.deliveries(formId, webhookId),
        (deliveries) => deliveries && [delivery, ...deliveries],
      );
      queryClient.setQueryData<Webhook[]>(webhookKeys.list(formId), (webhooks) =>
        webhooks?.map((webhook) =>
          webhook.id === webhookId ? { ...webhook, lastDelivery: delivery } : webhook,
        ),
      );
    },
  });
}
