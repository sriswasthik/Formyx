import { Router, type RequestHandler } from 'express';
import { API_WIDE } from '../middleware/rate-limit.js';

/*
 * Lists every endpoint an app registers, with the middleware in front of it, so tests can
 * check that none was left out of the authorization matrix or the rate limits. Express 5 keeps
 * no readable mount paths, so the paths are recorded while the app is built.
 */

export interface RecordedRoute {
  method: string;
  /** The full path, e.g. `/api/forms/:formId/integrations`. */
  path: string;
  /** Whether a limiter of its own runs for it: on the route, or on a router it is under. */
  limited: boolean;
  /** Whether the API-wide limiter runs for it (it skips some paths at run time). */
  apiWide: boolean;
}

type AnyRouter = ReturnType<typeof Router>;
interface RouteLike {
  methods: Record<string, boolean>;
  stack: { handle: RequestHandler }[];
}
interface RouterProto {
  use: (this: AnyRouter, ...args: unknown[]) => unknown;
  route: (this: AnyRouter, path: string) => RouteLike;
}

/** express-rate-limit's middleware carries these, and nothing else does. */
function isRateLimiter(handler: unknown): boolean {
  return typeof handler === 'function' && 'resetKey' in handler && 'getKey' in handler;
}

function joinPaths(prefix: string, path: string): string {
  const joined = `${prefix}/${path}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

/** Runs `build` (which makes an Express app) and returns the app with its endpoints. */
export function recordRoutes<T>(build: () => T): { result: T; routes: RecordedRoute[] } {
  // Each router is a function whose prototype is a Router instance; the methods are one up.
  const proto = Object.getPrototypeOf(Object.getPrototypeOf(Router())) as RouterProto;
  const originalUse = proto.use;
  const originalRoute = proto.route;
  const mounts = new Map<AnyRouter, { parent: AnyRouter; path: string }>();
  const limitedRouters = new Map<AnyRouter, string[]>();
  const apiWideRouters = new Map<AnyRouter, string[]>();
  const declared: { router: AnyRouter; path: string; route: RouteLike }[] = [];

  proto.use = function use(this: AnyRouter, ...args: unknown[]) {
    const path = typeof args[0] === 'string' ? args[0] : '/';
    for (const handler of args.flat()) {
      if (typeof handler !== 'function') continue;
      if (Object.prototype.isPrototypeOf.call(proto, handler)) {
        mounts.set(handler as AnyRouter, { parent: this, path });
      } else if (isRateLimiter(handler)) {
        const into = API_WIDE in handler ? apiWideRouters : limitedRouters;
        into.set(this, [...(into.get(this) ?? []), path]);
      }
    }
    return originalUse.apply(this, args);
  };
  proto.route = function route(this: AnyRouter, path: string) {
    const created = originalRoute.call(this, path);
    declared.push({ router: this, path, route: created });
    return created;
  };

  let result: T;
  try {
    result = build();
  } finally {
    proto.use = originalUse;
    proto.route = originalRoute;
  }

  /** The routers from the app's own down to `router`, each with the path it is mounted at. */
  function chain(router: AnyRouter): { router: AnyRouter; prefix: string }[] {
    const mount = mounts.get(router);
    if (!mount) return [{ router, prefix: '' }];
    const above = chain(mount.parent);
    const parentPrefix = above.at(-1)?.prefix ?? '';
    return [...above, { router, prefix: joinPaths(parentPrefix, mount.path) }];
  }

  const routes = declared.flatMap(({ router, path, route }) => {
    const routers = chain(router);
    const full = joinPaths(routers.at(-1)?.prefix ?? '', path);
    const under = (mounted: Map<AnyRouter, string[]>) =>
      routers.some(({ router: r, prefix }) =>
        (mounted.get(r) ?? []).some((mountPath) => full.startsWith(joinPaths(prefix, mountPath))),
      );
    const limited =
      under(limitedRouters) || route.stack.some(({ handle }) => isRateLimiter(handle));
    const apiWide = under(apiWideRouters);
    return Object.keys(route.methods)
      .filter((method) => method !== '_all')
      .map((method) => ({ method: method.toUpperCase(), path: full, limited, apiWide }));
  });
  return { result, routes };
}

/** Whether a concrete URL (`/api/forms/abc`) is an instance of a route path (`/api/forms/:id`). */
export function matchesRoute(path: string, url: string): boolean {
  const pattern = path
    .split('/')
    .map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${pattern}$`).test(url.split('?')[0] ?? '');
}
