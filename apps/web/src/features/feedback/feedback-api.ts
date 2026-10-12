import type { FeedbackInput } from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

const sentSchema = z.object({ id: z.string() });

export function sendFeedback(input: FeedbackInput) {
  return apiRequest('/feedback', sentSchema, jsonRequest('POST', input));
}
