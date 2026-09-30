import { describe, expect, it } from 'vitest';
import { getRedirectTarget, redirectStateFor } from './redirect';

describe('redirectStateFor', () => {
  it('keeps the path, query and hash', () => {
    expect(redirectStateFor({ pathname: '/app/forms', search: '?q=nps', hash: '#top' })).toEqual({
      from: '/app/forms?q=nps#top',
    });
  });
});

describe('getRedirectTarget', () => {
  it.each(['/app', '/app/forms', '/app/settings?tab=profile', '/app#section'])(
    'accepts the in-app path %j',
    (from) => {
      expect(getRedirectTarget({ from })).toBe(from);
    },
  );

  it.each([
    undefined,
    null,
    'string',
    {},
    { from: 42 },
    { from: '/' },
    { from: '/login' },
    { from: '/application' },
    { from: '//evil.example/app' },
    { from: 'https://evil.example/app' },
    { from: 'javascript:alert(1)' },
  ])('falls back to /app for %j', (state) => {
    expect(getRedirectTarget(state)).toBe('/app');
  });
});
