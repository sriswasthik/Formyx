import { describe, expect, it } from 'vitest';
import { reportError, scrubEvent } from './monitoring';

describe('scrubEvent', () => {
  it('drops the URL’s query and hash, the user and breadcrumbs', () => {
    expect(
      scrubEvent({
        type: undefined,
        message: 'Boom',
        user: { id: 'u', ip_address: '{{auto}}' },
        breadcrumbs: [{ message: 'clicked Submit' }],
        request: {
          url: 'https://formyx.app/f/survey?name=Ada&email=ada%40example.com#edit=token',
          headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://mail.example.com/inbox' },
        },
      }),
    ).toEqual({
      type: undefined,
      message: 'Boom',
      request: { url: 'https://formyx.app/f/survey', headers: { 'User-Agent': 'Mozilla/5.0' } },
    });
  });
});

describe('reportError', () => {
  it('does nothing without a DSN', () => {
    expect(() => {
      reportError(new Error('Nobody listens'));
    }).not.toThrow();
  });
});
