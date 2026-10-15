import { describe, expect, it } from 'vitest';
import { deleteAccountInputSchema } from './settings/preferences.js';
import {
  isAfterSignInPath,
  signInErrorMessage,
  signInErrorSchema,
  signInStartQuerySchema,
} from './sign-in.js';

describe('isAfterSignInPath', () => {
  it.each(['/app', '/app/forms', '/app?tab=1', '/app#top', '/invite/Abc_123-xyz'])(
    'accepts %j',
    (path) => {
      expect(isAfterSignInPath(path)).toBe(true);
    },
  );

  it.each([
    '',
    '/',
    '/login',
    '/apps',
    '/application',
    '//evil.example',
    'https://evil.example/app',
    '/invite/abc/def',
    '/invite/',
  ])('refuses %j', (path) => {
    expect(isAfterSignInPath(path)).toBe(false);
  });
});

describe('signInStartQuerySchema', () => {
  it('keeps a safe next path, a referral code and a source', () => {
    expect(
      signInStartQuerySchema.parse({ next: '/app/forms', ref: 'ABCDEFGH', source: 'badge' }),
    ).toMatchObject({ next: '/app/forms', source: 'badge' });
  });

  it('drops what it does not trust instead of refusing to start', () => {
    expect(
      signInStartQuerySchema.parse({ next: 'https://evil.example', ref: '!', source: 'tv' }),
    ).toEqual({ next: undefined, ref: undefined, source: undefined });
  });
});

describe('signInErrorMessage', () => {
  it('has a message for every error, naming the provider', () => {
    for (const error of signInErrorSchema.options) {
      expect(signInErrorMessage(error, 'zoho')).toMatch(/\.$/);
    }
    expect(signInErrorMessage('cancelled', 'google')).toContain('Google');
  });
});

describe('deleteAccountInputSchema', () => {
  it('takes a password, or an email typed out', () => {
    expect(deleteAccountInputSchema.parse({ password: 'secret' })).toEqual({ password: 'secret' });
    expect(deleteAccountInputSchema.parse({ email: ' Ada@Example.com ' })).toEqual({
      email: 'ada@example.com',
    });
    expect(deleteAccountInputSchema.safeParse({}).success).toBe(false);
  });
});
