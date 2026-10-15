import { describe, expect, it } from 'vitest';
import { profileFromIdToken, SignInFlowError, zohoAccountsServer } from './providers.js';

const NOW = Date.UTC(2026, 9, 17, 12);
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (claims: object) => `${encode({ alg: 'RS256' })}.${encode(claims)}.sig`;

const valid = {
  iss: 'https://accounts.google.com',
  aud: 'client',
  exp: NOW / 1000 + 3600,
  sub: '1234',
  email: 'ada@example.com',
  email_verified: true,
  name: 'Ada Lovelace',
};
const options = {
  clientId: 'client',
  issuers: ['https://accounts.google.com', 'accounts.google.com'],
  now: NOW,
};

function refusal(claims: object) {
  try {
    profileFromIdToken('google', token(claims), options);
  } catch (error) {
    return error instanceof SignInFlowError ? error.code : error;
  }
  return null;
}

describe('profileFromIdToken', () => {
  it('reads who signed in', () => {
    expect(profileFromIdToken('google', token(valid), options)).toEqual({
      provider: 'google',
      subject: '1234',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada Lovelace',
    });
  });

  it('takes the issuer as a bare host, an audience list, and "true" as a string', () => {
    const profile = profileFromIdToken(
      'google',
      token({
        ...valid,
        iss: 'accounts.google.com',
        aud: ['other', 'client'],
        email_verified: 'true',
      }),
      options,
    );
    expect(profile.emailVerified).toBe(true);
  });

  it('counts a missing or false email_verified as not confirmed', () => {
    const { email_verified: _, ...unverified } = valid;
    expect(profileFromIdToken('google', token(unverified), options).emailVerified).toBe(false);
    expect(
      profileFromIdToken('google', token({ ...valid, email_verified: 'false' }), options)
        .emailVerified,
    ).toBe(false);
  });

  it('builds a name from given and family names, or leaves it out', () => {
    const { name: _, ...nameless } = valid;
    expect(
      profileFromIdToken(
        'google',
        token({ ...nameless, given_name: 'Ada', family_name: 'L' }),
        options,
      ).name,
    ).toBe('Ada L');
    expect(profileFromIdToken('google', token(nameless), options).name).toBeNull();
  });

  it.each([
    ['another audience', { ...valid, aud: 'someone-else' }],
    ['another issuer', { ...valid, iss: 'https://evil.example' }],
    ['an expired token', { ...valid, exp: NOW / 1000 - 120 }],
    ['no email', { ...valid, email: undefined }],
    ['no subject', { ...valid, sub: '' }],
  ])('refuses %s', (_name, claims) => {
    expect(refusal(claims)).toBe('failed');
  });

  it('allows a minute of clock drift', () => {
    expect(refusal({ ...valid, exp: NOW / 1000 - 30 })).toBeNull();
  });

  it('refuses a missing or garbled token', () => {
    expect(() => profileFromIdToken('google', undefined, options)).toThrow(SignInFlowError);
    expect(() => profileFromIdToken('google', 'not-a-jwt', options)).toThrow(SignInFlowError);
    expect(() => profileFromIdToken('google', 'a.!!!.c', options)).toThrow(SignInFlowError);
  });
});

describe('zohoAccountsServer', () => {
  const env = { ZOHO_ACCOUNTS_URL: 'https://accounts.zoho.com' };

  it('uses the configured data centre when Zoho names none', () => {
    expect(zohoAccountsServer(env, undefined)).toBe('https://accounts.zoho.com');
  });

  it("takes Zoho's own data centres", () => {
    expect(zohoAccountsServer(env, 'https://accounts.zoho.in')).toBe('https://accounts.zoho.in');
    expect(zohoAccountsServer(env, 'https://accounts.zoho.eu/')).toBe('https://accounts.zoho.eu');
  });

  it('refuses anywhere else, so the client secret never leaves for it', () => {
    expect(zohoAccountsServer(env, 'https://accounts.zoho.in.evil.example')).toBeNull();
    expect(zohoAccountsServer(env, 'http://accounts.zoho.in')).toBeNull();
    expect(zohoAccountsServer(env, 'https://evil.example')).toBeNull();
  });
});
