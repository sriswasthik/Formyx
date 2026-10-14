import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * `GET /api/health/ready`, for uptime monitors: 200 when the API can reach its database,
 * 503 when it can't.
 */
export const readinessResponseSchema = z.object({
  status: z.enum(['ready', 'unavailable']),
  database: z.enum(['ok', 'down']),
  timestamp: z.iso.datetime(),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
