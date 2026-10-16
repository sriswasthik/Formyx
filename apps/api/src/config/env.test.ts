import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EnvError, envSchema, parseEnv } from './env.js';

const REQUIRED = {
  DATABASE_URL: 'postgresql://formyx:formyx@localhost:5432/formyx',
  JWT_SECRET: 'a-development-secret-of-at-least-32-chars',
};

describe('parseEnv', () => {
  it('applies development defaults', () => {
    expect(parseEnv(REQUIRED)).toEqual({
      ...REQUIRED,
      NODE_ENV: 'development',
      PORT: 4000,
      CORS_ORIGIN: ['http://localhost:5173'],
      LOG_LEVEL: 'info',
      TRUST_PROXY: false,
      BCRYPT_COST: 12,
      AUTH_RATE_LIMIT_MAX: 10,
      API_RATE_LIMIT_MAX: 3000,
      SUBMISSION_RATE_LIMIT_MAX: 10,
      INVITE_RATE_LIMIT_MAX: 20,
      WEBHOOK_ALLOW_PRIVATE_URLS: false,
      DEMO_ENABLED: false,
      ENTITLEMENTS_MODE: 'all_unlocked',
      APP_URL: 'http://localhost:5173',
      EMAIL_FROM: 'Formyx <notifications@formyx.app>',
      CLOUDINARY_FOLDER: 'formyx',
      CLOUDINARY_API_URL: 'https://api.cloudinary.com',
      PINCODE_API_URL: 'https://api.postalpincode.in/pincode',
      WORKERS: true,
      GOOGLE_OAUTH_URL: 'https://accounts.google.com',
      GOOGLE_TOKEN_URL: 'https://oauth2.googleapis.com',
      GOOGLE_SHEETS_URL: 'https://sheets.googleapis.com',
      ZOHO_ACCOUNTS_URL: 'https://accounts.zoho.com',
      NOTION_API_URL: 'https://api.notion.com',
      POSTHOG_HOST: 'https://eu.i.posthog.com',
      RAZORPAY_API_URL: 'https://api.razorpay.com',
      RAZORPAY_LIVE: false,
      ENFORCEMENT_MODE: 'soft',
      REQUIRE_EMAIL_VERIFICATION: false,
      NEW_ACCOUNT_LIMITS: true,
      SAFE_BROWSING_URL: 'https://safebrowsing.googleapis.com',
      BLOCKED_LINK_DOMAINS: [],
      TURNSTILE_URL: 'https://challenges.cloudflare.com',
    });
    expect(parseEnv(REQUIRED).RESEND_API_KEY).toBeUndefined();
    expect(parseEnv(REQUIRED).ENCRYPTION_KEYS).toBeUndefined();
  });

  it('unlocks every feature unless entitlements are enforced', () => {
    expect(parseEnv({ ...REQUIRED, ENTITLEMENTS_MODE: 'enforced' }).ENTITLEMENTS_MODE).toBe(
      'enforced',
    );
    expect(() => parseEnv({ ...REQUIRED, ENTITLEMENTS_MODE: 'on' })).toThrow(EnvError);
  });

  it('normalises APP_URL and treats a blank RESEND_API_KEY as unset', () => {
    const env = parseEnv({ ...REQUIRED, APP_URL: 'https://formyx.app/', RESEND_API_KEY: ' ' });
    expect(env.APP_URL).toBe('https://formyx.app');
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it('coerces PORT and parses a comma-separated, normalised origin list', () => {
    const env = parseEnv({
      ...REQUIRED,
      PORT: '8080',
      CORS_ORIGIN: 'https://formyx.app/, https://www.formyx.app ,',
    });

    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGIN).toEqual(['https://formyx.app', 'https://www.formyx.app']);
  });

  it.each([
    ['false', false],
    ['true', true],
    ['1', 1],
    ['loopback, 10.0.0.0/8', 'loopback, 10.0.0.0/8'],
  ])('parses TRUST_PROXY=%j', (value, expected) => {
    expect(parseEnv({ ...REQUIRED, TRUST_PROXY: value }).TRUST_PROXY).toEqual(expected);
  });

  it('accepts postgres:// and Neon-style URLs with query parameters', () => {
    const url =
      'postgres://user:pass@ep-calm-sun-123.eu-central-1.aws.neon.tech/formyx?sslmode=require';
    expect(parseEnv({ ...REQUIRED, DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it.each([
    [{ PORT: 'abc' }, 'PORT'],
    [{ PORT: '70000' }, 'PORT'],
    [{ NODE_ENV: 'staging' }, 'NODE_ENV'],
    [{ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL'],
    [{ CORS_ORIGIN: 'not a url' }, 'CORS_ORIGIN'],
    [{ CORS_ORIGIN: 'ftp://files.example' }, 'CORS_ORIGIN'],
    [{ CORS_ORIGIN: ' , ' }, 'CORS_ORIGIN'],
    [{ DATABASE_URL: undefined }, 'DATABASE_URL'],
    [{ DATABASE_URL: 'mysql://localhost/formyx' }, 'DATABASE_URL'],
    [{ JWT_SECRET: undefined }, 'JWT_SECRET'],
    [{ JWT_SECRET: 'too-short' }, 'JWT_SECRET'],
    [{ BCRYPT_COST: '3' }, 'BCRYPT_COST'],
    [{ AUTH_RATE_LIMIT_MAX: '0' }, 'AUTH_RATE_LIMIT_MAX'],
    [{ SUBMISSION_RATE_LIMIT_MAX: '0' }, 'SUBMISSION_RATE_LIMIT_MAX'],
    [{ APP_URL: 'formyx.app' }, 'APP_URL'],
  ])('rejects %j and names the variable', (overrides, variable) => {
    const source = { ...REQUIRED, ...overrides };
    expect(() => parseEnv(source)).toThrow(EnvError);
    expect(() => parseEnv(source)).toThrow(variable);
  });
});

describe('RAZORPAY_LIVE', () => {
  const live = { RAZORPAY_KEY_ID: 'rzp_live_AbC123', RAZORPAY_KEY_SECRET: 'secret' };
  const test = { RAZORPAY_KEY_ID: 'rzp_test_AbC123', RAZORPAY_KEY_SECRET: 'secret' };

  it('is off by default, and test keys work without it', () => {
    expect(parseEnv({ ...REQUIRED, ...test }).RAZORPAY_LIVE).toBe(false);
  });

  it('refuses live keys until it is turned on', () => {
    expect(() => parseEnv({ ...REQUIRED, ...live })).toThrow(/RAZORPAY_LIVE is not true/);
    expect(parseEnv({ ...REQUIRED, ...live, RAZORPAY_LIVE: 'true' }).RAZORPAY_LIVE).toBe(true);
  });

  it('refuses test keys, or none, once it is on', () => {
    expect(() => parseEnv({ ...REQUIRED, ...test, RAZORPAY_LIVE: 'true' })).toThrow(
      /must be a live key/,
    );
    expect(() => parseEnv({ ...REQUIRED, RAZORPAY_LIVE: 'true' })).toThrow(EnvError);
  });
});

describe('.env.example', () => {
  /** Set by the host, or used only by the test runner. */
  const NOT_IN_BOTH = { schemaOnly: ['RENDER_GIT_COMMIT'], exampleOnly: ['TEST_DATABASE_URL'] };

  it('lists every setting the API reads, and nothing it does not', () => {
    const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
    const listed = new Set(
      [...example.matchAll(/^(?:# ?)?([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1] ?? ''),
    );
    const read = new Set(Object.keys(envSchema.shape));
    expect([...read].filter((key) => !listed.has(key))).toEqual(NOT_IN_BOTH.schemaOnly);
    expect([...listed].filter((key) => !read.has(key))).toEqual(NOT_IN_BOTH.exampleOnly);
  });
});
