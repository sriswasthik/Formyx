import {
  deleteSubmissionsResponseSchema,
  formAnalyticsSchema,
  notificationSettingsSchema,
  realtimeTokenResponseSchema,
  submissionPageSchema,
  submissionRecordSchema,
  type AnalyticsRange,
  type DeleteSubmissionsInput,
  type FormAnalytics,
  type NotificationSettings,
  type RealtimeTokenResponse,
  type SubmissionOrder,
  type SubmissionPage,
  type SubmissionRecord,
} from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

const formPath = (formId: string) => `/forms/${encodeURIComponent(formId)}`;
const submissionsPath = (formId: string) => `${formPath(formId)}/submissions`;

/** What the responses table is showing; part of its query key. */
export interface ResponseFilters {
  order: SubmissionOrder;
  /** Text to find in the answers. */
  search?: string;
  /** Only responses that answered this question. */
  answered?: string;
}

export function getAnalytics(
  formId: string,
  range: AnalyticsRange,
  timeZone: string,
): Promise<FormAnalytics> {
  const query = new URLSearchParams({ range, tz: timeZone });
  return apiRequest(`${formPath(formId)}/analytics?${query.toString()}`, formAnalyticsSchema);
}

export function listResponses(
  formId: string,
  filters: ResponseFilters,
  cursor: string | null,
): Promise<SubmissionPage> {
  const query = new URLSearchParams({ order: filters.order });
  if (filters.search) query.set('search', filters.search);
  if (filters.answered) query.set('answered', filters.answered);
  if (cursor) query.set('cursor', cursor);
  return apiRequest(`${submissionsPath(formId)}?${query.toString()}`, submissionPageSchema);
}

export function getResponse(formId: string, responseId: string): Promise<SubmissionRecord> {
  return apiRequest(
    `${submissionsPath(formId)}/${encodeURIComponent(responseId)}`,
    submissionRecordSchema,
  );
}

/** Deletes the responses and returns how many went (ids already gone are skipped). */
export async function deleteResponses(formId: string, ids: readonly string[]): Promise<number> {
  const [only] = ids;
  if (ids.length === 1 && only) {
    await apiRequest(`${submissionsPath(formId)}/${encodeURIComponent(only)}`, z.undefined(), {
      method: 'DELETE',
    });
    return 1;
  }
  const { deleted } = await apiRequest(
    `${submissionsPath(formId)}/bulk-delete`,
    deleteSubmissionsResponseSchema,
    jsonRequest('POST', { ids: [...ids] } satisfies DeleteSubmissionsInput),
  );
  return deleted;
}

/** Downloading this sends the session cookie, like any other API request from this site. */
export function exportResponsesUrl(formId: string): string {
  return `/api${submissionsPath(formId)}/export`;
}

export function getNotificationSettings(formId: string): Promise<NotificationSettings> {
  return apiRequest(`${formPath(formId)}/notifications`, notificationSettingsSchema);
}

export function updateNotificationSettings(
  formId: string,
  settings: NotificationSettings,
): Promise<NotificationSettings> {
  return apiRequest(
    `${formPath(formId)}/notifications`,
    notificationSettingsSchema,
    jsonRequest('PUT', settings),
  );
}

export function getRealtimeToken(): Promise<RealtimeTokenResponse> {
  return apiRequest('/realtime/token', realtimeTokenResponseSchema);
}
