import { meResponseSchema, type MeResponse } from '@formyx/shared';
import { apiRequest } from '@/lib/api';

/** Whether this build offers the shared demo account. The API must have DEMO_ENABLED too. */
export function isDemoOffered(): boolean {
  return import.meta.env.VITE_DEMO_ENABLED === 'true';
}

/** Signs in to the shared demo account, which the API sets up on first use. */
export function startDemo(): Promise<MeResponse> {
  return apiRequest('/auth/demo', meResponseSchema, { method: 'POST' });
}
