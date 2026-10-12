import type { ErrorEvent } from '@sentry/node';
import { describe, expect, it } from 'vitest';
import { isProgrammingError, reportError, scrubEvent } from './monitoring.js';

describe('scrubEvent', () => {
  it('keeps what debugging needs and drops what could identify someone', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: 'Boom',
      user: { id: 'user-1', email: 'ada@example.com', ip_address: '203.0.113.9' },
      request: {
        method: 'POST',
        url: 'https://api.formyx.app/api/public/forms/survey/edit?token=secret-edit-token',
        query_string: 'token=secret-edit-token',
        cookies: { formyx_session: 'jwt' },
        data: { answers: { name: 'Ada' } },
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Cookie: 'formyx_session=jwt',
          Authorization: 'Bearer token',
          'X-Forwarded-For': '203.0.113.9',
        },
      },
    };

    expect(scrubEvent(event)).toEqual({
      type: undefined,
      message: 'Boom',
      request: {
        method: 'POST',
        url: 'https://api.formyx.app/api/public/forms/survey/edit',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
    });
  });

  it('leaves events without a request alone, apart from the user', () => {
    expect(scrubEvent({ type: undefined, message: 'Job', user: { id: 'u' } })).toEqual({
      type: undefined,
      message: 'Job',
    });
  });
});

describe('isProgrammingError', () => {
  it('tells bugs from failures outside Formyx', () => {
    expect(isProgrammingError(new TypeError('x is undefined'))).toBe(true);
    expect(isProgrammingError(new RangeError('Invalid time value'))).toBe(true);
    expect(isProgrammingError(new Error('Receiver answered 500'))).toBe(false);
    expect(isProgrammingError('a string')).toBe(false);
  });
});

describe('reportError', () => {
  it('does nothing when Sentry is not set up', () => {
    expect(() => {
      reportError(new Error('Nobody listens'), { route: '/api/forms' });
    }).not.toThrow();
  });
});
