import { describe, expect, it } from 'vitest';
import { ADA, jsonResponse, stubFetch } from '@/test/session';
import { fetchMe } from './auth-api';
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
});
