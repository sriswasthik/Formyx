import type { MeResponse } from '@formyx/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type * as React from 'react';
import { vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { meQueryKey } from '@/features/auth/session-cache';

export const ADA: MeResponse = {
  user: {
    id: 'user_ada',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: '2026-09-30T08:00:00.000Z',
  },
  workspaces: [
    { id: 'ws_personal', name: "Ada's workspace", slug: 'ada-x7k2p9', role: 'OWNER' },
    { id: 'ws_team', name: 'Analytical Engines', slug: 'analytical-engines', role: 'EDITOR' },
  ],
};

/**
 * A query client for tests. Pass `me` to start signed in (`null` for signed out); leave it
 * out to let the "me" query hit the (stubbed) network.
 */
export function createTestQueryClient(me?: MeResponse | null): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  if (me !== undefined) queryClient.setQueryData(meQueryKey, me);
  return queryClient;
}

/** Renders `ui` with the app's providers around it. */
export function renderWithProviders(ui: React.ReactElement, queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Replaces `fetch` for the current test. Restored by `vi.unstubAllGlobals()` in setup. */
export function stubFetch(
  handler: (path: string, init: RequestInit) => Response | Promise<Response>,
) {
  const fetchMock = vi.fn<typeof fetch>((input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return Promise.resolve(handler(url, init));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The parsed JSON body of the `index`-th call to a stubbed fetch. */
export function requestBody(fetchMock: ReturnType<typeof stubFetch>, index = 0): unknown {
  const body = fetchMock.mock.calls[index]?.[1]?.body;
  return typeof body === 'string' ? JSON.parse(body) : undefined;
}
