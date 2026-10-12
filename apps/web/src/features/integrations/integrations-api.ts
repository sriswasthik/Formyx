import {
  connectIntegrationResponseSchema,
  integrationsOverviewSchema,
  integrationViewSchema,
  type IntegrationKind,
  type IntegrationsOverview,
  type IntegrationView,
} from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

export const integrationKeys = {
  overview: (formId: string) => ['forms', formId, 'integrations'] as const,
};

const base = (formId: string) => `/forms/${encodeURIComponent(formId)}`;

export function getIntegrations(formId: string): Promise<IntegrationsOverview> {
  return apiRequest(`${base(formId)}/integrations`, integrationsOverviewSchema);
}

/** Where to send the browser to sign in to the service and grant access. */
export async function connectIntegration(formId: string, kind: IntegrationKind): Promise<string> {
  const { authorizeUrl } = await apiRequest(
    `${base(formId)}/integrations/${kind}/connect`,
    connectIntegrationResponseSchema,
    { method: 'POST' },
  );
  return authorizeUrl;
}

export function setIntegrationPaused(
  formId: string,
  integrationId: string,
  paused: boolean,
): Promise<IntegrationView> {
  return apiRequest(
    `${base(formId)}/integrations/${encodeURIComponent(integrationId)}`,
    integrationViewSchema,
    jsonRequest('PATCH', { paused }),
  );
}

export function resyncIntegration(formId: string, integrationId: string): Promise<void> {
  return apiRequest(
    `${base(formId)}/integrations/${encodeURIComponent(integrationId)}/resync`,
    z.undefined(),
    { method: 'POST' },
  );
}

export function disconnectIntegration(formId: string, integrationId: string): Promise<void> {
  return apiRequest(
    `${base(formId)}/integrations/${encodeURIComponent(integrationId)}`,
    z.undefined(),
    { method: 'DELETE' },
  );
}

export function retryFailedJob(formId: string, failureId: string): Promise<void> {
  return apiRequest(
    `${base(formId)}/job-failures/${encodeURIComponent(failureId)}/retry`,
    z.undefined(),
    { method: 'POST' },
  );
}

export function dismissFailedJob(formId: string, failureId: string): Promise<void> {
  return apiRequest(
    `${base(formId)}/job-failures/${encodeURIComponent(failureId)}`,
    z.undefined(),
    { method: 'DELETE' },
  );
}
