import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiRequest, ApiRequestError } from './api';

const itemSchema = z.object({ id: z.string() });

function mockFetch(response: Response | Error) {
  const fn = vi.fn<typeof fetch>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('prefixes /api, sends credentials and returns the parsed body', async () => {
    const fetchMock = mockFetch(json({ id: 'f_1' }));

    await expect(apiRequest('/forms/f_1', itemSchema)).resolves.toEqual({ id: 'f_1' });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/forms/f_1');
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('Accept')).toBe('application/json');
  });

  it('throws the server error code and message for API errors', async () => {
    mockFetch(json({ error: { code: 'NOT_FOUND', message: 'Form not found' } }, 404));

    const error = await apiRequest('/forms/x', itemSchema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Form not found' });
  });

  it('keeps validation details', async () => {
    const details = [{ path: 'title', message: 'Required' }];
    mockFetch(json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid', details } }, 400));

    await expect(apiRequest('/forms', itemSchema)).rejects.toMatchObject({ details });
  });

  it('reports non-standard error responses as UNKNOWN_ERROR', async () => {
    mockFetch(new Response('Bad gateway', { status: 502 }));

    await expect(apiRequest('/health', itemSchema)).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN_ERROR',
    });
  });

  it('reports network failures as NETWORK_ERROR', async () => {
    mockFetch(new TypeError('Failed to fetch'));

    await expect(apiRequest('/health', itemSchema)).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });

  it('rejects responses that do not match the schema', async () => {
    mockFetch(json({ id: 42 }));

    await expect(apiRequest('/forms/f_1', itemSchema)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
