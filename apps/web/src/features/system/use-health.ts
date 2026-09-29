import { healthResponseSchema } from '@formyx/shared';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';

export function useHealthQuery() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiRequest('/health', healthResponseSchema, { signal }),
    refetchInterval: 30_000,
  });
}
