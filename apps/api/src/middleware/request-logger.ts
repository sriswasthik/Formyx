import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

const REQUEST_ID_PATTERN = /^[\w-]{1,128}$/;

/** Reuses a well-formed incoming `X-Request-Id` (e.g. from a load balancer) or mints a new one. */
export function resolveRequestId(header: string | string[] | undefined): string {
  return typeof header === 'string' && REQUEST_ID_PATTERN.test(header) ? header : randomUUID();
}

export function requestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = resolveRequestId(req.headers['x-request-id']);
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Keep request logs lean: headers are noisy and may carry credentials.
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customSuccessMessage: (req, res, responseTime) =>
      `${req.method ?? ''} ${req.url ?? ''} ${res.statusCode} in ${Math.round(responseTime)}ms`,
    customErrorMessage: (req, res) => `${req.method ?? ''} ${req.url ?? ''} ${res.statusCode}`,
    // Health checks are polled constantly by load balancers; logging them is noise.
    autoLogging: { ignore: (req) => req.url === '/api/health' },
  });
}
