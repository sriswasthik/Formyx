import { describe, expect, it } from 'vitest';
import { type z } from 'zod';
import { loginInputSchema, meResponseSchema, registerInputSchema, utf8ByteLength } from './auth.js';
import { toValidationIssues } from './errors.js';

describe('utf8ByteLength', () => {
  it.each(['', 'ascii', 'ünï', '€uro', '李雷', '🔒 lock', '\u{10FFFF}', '\uD800'])(
    'matches TextEncoder for %j',
    (value) => {
      expect(utf8ByteLength(value)).toBe(new TextEncoder().encode(value).length);
    },
  );
});

/** Returns field -> messages for a failed parse, or `null` when the input is valid. */
function issuesFor(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  return result.success ? null : toValidationIssues(result.error);
}

const validRegistration = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'analytical',
};

describe('registerInputSchema', () => {
  it('trims the name and normalises the email', () => {
    expect(
      registerInputSchema.parse({
        name: '  Ada Lovelace ',
        email: '  Ada@Example.COM ',
        password: 'analytical',
      }),
    ).toEqual(validRegistration);
  });

  it('never trims or changes the password', () => {
    const password = '  Pass word  ';
    expect(registerInputSchema.parse({ ...validRegistration, password }).password).toBe(password);
  });

  it('reports one friendly message per missing field', () => {
    expect(issuesFor(registerInputSchema, {})).toEqual([
      { path: 'name', message: 'Enter your name' },
      { path: 'email', message: 'Enter your email' },
      { path: 'password', message: 'Enter a password' },
    ]);
    expect(issuesFor(registerInputSchema, { name: ' ', email: ' ', password: '' })).toEqual([
      { path: 'name', message: 'Enter your name' },
      { path: 'email', message: 'Enter your email' },
      { path: 'password', message: 'Enter a password' },
    ]);
  });

  it.each(['ada', 'ada@', '@example.com', 'ada@example', 'ada lovelace@example.com'])(
    'rejects the email %j',
    (email) => {
      expect(issuesFor(registerInputSchema, { ...validRegistration, email })).toEqual([
        { path: 'email', message: 'Enter a valid email address' },
      ]);
    },
  );

  it('rejects names longer than 80 characters', () => {
    expect(issuesFor(registerInputSchema, { ...validRegistration, name: 'a'.repeat(81) })).toEqual([
      { path: 'name', message: 'Use 80 characters or fewer' },
    ]);
  });

  it('requires at least 8 characters', () => {
    expect(issuesFor(registerInputSchema, { ...validRegistration, password: 'short' })).toEqual([
      { path: 'password', message: 'Use at least 8 characters' },
    ]);
    expect(issuesFor(registerInputSchema, { ...validRegistration, password: '12345678' })).toBe(
      null,
    );
  });

  it('limits passwords to the 72 bytes bcrypt actually uses', () => {
    expect(issuesFor(registerInputSchema, { ...validRegistration, password: 'a'.repeat(72) })).toBe(
      null,
    );
    expect(
      issuesFor(registerInputSchema, { ...validRegistration, password: 'a'.repeat(73) }),
    ).toEqual([{ path: 'password', message: 'Password is too long' }]);
    // 25 characters, but 75 bytes in UTF-8.
    expect(
      issuesFor(registerInputSchema, { ...validRegistration, password: '€'.repeat(25) }),
    ).toEqual([{ path: 'password', message: 'Password is too long' }]);
  });
});

describe('loginInputSchema', () => {
  it('normalises the email like registration does', () => {
    expect(loginInputSchema.parse({ email: ' ADA@example.com', password: 'x' })).toEqual({
      email: 'ada@example.com',
      password: 'x',
    });
  });

  it('only requires a password to be present', () => {
    expect(issuesFor(loginInputSchema, { email: 'ada@example.com', password: '' })).toEqual([
      { path: 'password', message: 'Enter your password' },
    ]);
    expect(issuesFor(loginInputSchema, { email: 'ada@example.com', password: 'short' })).toBe(null);
  });
});

describe('meResponseSchema', () => {
  it('accepts a user with their workspaces and roles', () => {
    const body = {
      user: {
        id: 'u1',
        name: 'Ada',
        email: 'ada@example.com',
        createdAt: '2026-09-30T08:00:00.000Z',
      },
      workspaces: [{ id: 'w1', name: "Ada's workspace", slug: 'ada-x7k2p9', role: 'OWNER' }],
    };
    expect(meResponseSchema.parse(body)).toEqual(body);
  });

  it('rejects unknown roles', () => {
    const result = meResponseSchema.safeParse({
      user: { id: 'u1', name: 'Ada', email: 'ada@example.com', createdAt: '2026-09-30T08:00:00Z' },
      workspaces: [{ id: 'w1', name: 'W', slug: 'w', role: 'ADMIN' }],
    });
    expect(result.success).toBe(false);
  });
});
