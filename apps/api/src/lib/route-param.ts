import type { Request } from 'express';

/** A named route param. Express 5 types params as `string | string[]` because of wildcards. */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Route is missing its :${name} param`);
  }
  return value;
}
