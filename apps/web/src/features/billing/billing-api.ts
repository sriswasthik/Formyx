import {
  billingSummarySchema,
  checkoutSchema,
  paymentsResponseSchema,
  verifyCheckoutResponseSchema,
  type BillingSummary,
  type CancelInput,
  type Checkout,
  type PaymentsResponse,
  type SubscribeInput,
  type VerifyCheckoutInput,
  type VerifyCheckoutResponse,
} from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

const billingPath = (workspaceId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/billing`;

export function getBilling(workspaceId: string): Promise<BillingSummary> {
  return apiRequest(billingPath(workspaceId), billingSummarySchema);
}

export function getPayments(workspaceId: string): Promise<PaymentsResponse> {
  return apiRequest(`${billingPath(workspaceId)}/payments`, paymentsResponseSchema);
}

export function subscribe(workspaceId: string, input: SubscribeInput): Promise<Checkout> {
  return apiRequest(
    `${billingPath(workspaceId)}/subscribe`,
    checkoutSchema,
    jsonRequest('POST', input),
  );
}

export function resumePlan(workspaceId: string): Promise<Checkout> {
  return apiRequest(`${billingPath(workspaceId)}/resume`, checkoutSchema, { method: 'POST' });
}

export function verifyCheckout(
  workspaceId: string,
  input: VerifyCheckoutInput,
): Promise<VerifyCheckoutResponse> {
  return apiRequest(
    `${billingPath(workspaceId)}/verify`,
    verifyCheckoutResponseSchema,
    jsonRequest('POST', input),
  );
}

export function cancelPlan(workspaceId: string, input: CancelInput): Promise<BillingSummary> {
  return apiRequest(
    `${billingPath(workspaceId)}/cancel`,
    billingSummarySchema,
    jsonRequest('POST', input),
  );
}

export function changePlan(workspaceId: string, input: SubscribeInput): Promise<BillingSummary> {
  return apiRequest(
    `${billingPath(workspaceId)}/change-plan`,
    billingSummarySchema,
    jsonRequest('POST', input),
  );
}

export async function dismissDowngrade(workspaceId: string): Promise<void> {
  await apiRequest(`${billingPath(workspaceId)}/dismiss-downgrade`, z.undefined(), {
    method: 'POST',
  });
}
