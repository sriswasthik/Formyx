import { describe, expect, it } from 'vitest';
import { getRedirectEmail, getRedirectTarget, redirectStateFor } from './redirect';

describe('redirectStateFor', () => {
  it('keeps the path, query and hash', () => {
    expect(redirectStateFor({ pathname: '/app/forms', search: '?q=nps', hash: '#top' })).toEqual({
      from: '/app/forms?q=nps#top',
    });
  });
});

describe('getRedirectTarget', () => {
  it.each([
    '/app',
    '/app/forms',
    '/app/settings?tab=profile',
    '/app#section',
    '/invite/Abc_123-xyz',
  ])('accepts the in-app path %j', (from) => {
    expect(getRedirectTarget({ from })).toBe(from);
  });

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
    { from: '/invite/' },
    { from: '/invite/abc/../../evil' },
    { from: '/invite/abc?next=//evil.example' },
  ])('falls back to /app for %j', (state) => {
    expect(getRedirectTarget(state)).toBe('/app');
  });
});

describe('getRedirectEmail', () => {
  it('reads an email from the state, and nothing else', () => {
    expect(getRedirectEmail({ from: '/invite/abc', email: 'ada@example.com' })).toBe(
      'ada@example.com',
    );
    expect(getRedirectEmail({ from: '/app' })).toBe('');
    expect(getRedirectEmail({ email: 42 })).toBe('');
    expect(getRedirectEmail(null)).toBe('');
  });
});
