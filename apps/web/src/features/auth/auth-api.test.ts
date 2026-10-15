import { describe, expect, it, vi } from 'vitest';
import { ADA, jsonResponse, stubFetch } from '@/test/session';
import { fetchMe, SESSION_CHECK_TIMEOUT_MS } from './auth-api';
import { hasSessionHint, SESSION_HINT_STORAGE_KEY, setSessionHint } from './session-cache';

describe('fetchMe', () => {
  it('returns null without a request when this browser has not signed in', async () => {
    const fetchMock = stubFetch(() => jsonResponse(ADA));

    await expect(fetchMe()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the session when there is one', async () => {
    setSessionHint(true);
    stubFetch(() => jsonResponse(ADA));

    await expect(fetchMe()).resolves.toEqual(ADA);
  });

  it('treats a 401 as signed out and forgets the hint', async () => {
    setSessionHint(true);
    stubFetch(() =>
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Log in to continue' } }, 401),
    );

    await expect(fetchMe()).resolves.toBeNull();
    expect(hasSessionHint()).toBe(false);
    expect(localStorage.getItem(SESSION_HINT_STORAGE_KEY)).toBeNull();
  });

  it('lets other failures surface as errors', async () => {
    setSessionHint(true);
    stubFetch(() =>
      jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }, 500),
    );

    await expect(fetchMe()).rejects.toMatchObject({ status: 500 });
    expect(hasSessionHint()).toBe(true);
  });

  it('gives up on an API that never answers', async () => {
    setSessionHint(true);
    // The real timeout, run down at once.
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    stubFetch(
      (_path, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation timed out.', 'TimeoutError'));
          });
        }),
    );

    const checking = fetchMe();
    expect(timeout).toHaveBeenCalledWith(SESSION_CHECK_TIMEOUT_MS);
    controller.abort();
    await expect(checking).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    timeout.mockRestore();
  });
});
