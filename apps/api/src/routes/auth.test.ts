import { apiErrorSchema, meResponseSchema } from '@formyx/shared';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request, { type Response } from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE, signSessionToken } from '../lib/session.js';
import { INVALID_CREDENTIALS_MESSAGE } from '../services/auth-service.js';
import { createTestApp, TEST_JWT_SECRET } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';

const ada = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct horse battery' };
const SEVEN_DAYS_IN_SECONDS = 604_800;

/** The raw `formyx_session=...; Path=/; ...` header, if the response set one. */
function sessionSetCookie(res: Response): string | undefined {
  const cookies = res.get('Set-Cookie');
  return cookies?.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

/** A `Cookie` request header carrying the session the response just set. */
function sessionCookieFrom(res: Response): string {
  const cookie = sessionSetCookie(res);
  if (!cookie) throw new Error('Expected the response to set a session cookie');
  return cookie.split(';')[0] ?? '';
}

function sessionCookieFor(userId: string, secret = TEST_JWT_SECRET): string {
  return `${SESSION_COOKIE}=${signSessionToken(userId, secret)}`;
}

describe('auth routes', () => {
  const app = createTestApp();

  function register(body: object = ada) {
    return request(app).post('/api/auth/register').send(body);
  }

  function logIn(body: object) {
    return request(app).post('/api/auth/login').send(body);
  }

  beforeEach(async () => {
    await resetDatabase();
  });

  describe('POST /api/auth/register', () => {
    it('creates the user with a personal workspace they own and signs them in', async () => {
      const res = await register().expect(201);

      const me = meResponseSchema.parse(res.body);
      expect(me.user).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
      expect(me.workspaces).toHaveLength(1);
      expect(me.workspaces[0]).toMatchObject({ name: "Ada's workspace", role: 'OWNER' });
      expect(me.workspaces[0]?.slug).toMatch(/^ada-[a-z0-9]{6}$/);

      const memberships = await prisma.membership.findMany();
      expect(memberships).toEqual([
        expect.objectContaining({
          userId: me.user.id,
          workspaceId: me.workspaces[0]?.id,
          role: 'OWNER',
        }),
      ]);
    });

    it('sets an httpOnly, SameSite=Lax session cookie that lasts 7 days', async () => {
      const cookie = sessionSetCookie(await register().expect(201));

      expect(cookie).toBeDefined();
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain(`Max-Age=${SEVEN_DAYS_IN_SECONDS}`);
      expect(cookie).not.toContain('Secure');
    });

    it('marks the cookie Secure in production', async () => {
      const production = createTestApp({ NODE_ENV: 'production' });
      const res = await request(production).post('/api/auth/register').send(ada).expect(201);

      expect(sessionSetCookie(res)).toContain('Secure');
    });

    it('stores a bcrypt hash and never returns it', async () => {
      const res = await register().expect(201);

      const user = await prisma.user.findUniqueOrThrow({ where: { email: ada.email } });
      expect(user.passwordHash).not.toBe(ada.password);
      expect(await bcrypt.compare(ada.password, user.passwordHash)).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain(user.passwordHash);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('rejects an email that is already registered, whatever its case', async () => {
      await register().expect(201);
      const res = await register({ ...ada, name: 'Impostor', email: ' ADA@Example.com ' }).expect(
        409,
      );

      expect(apiErrorSchema.parse(res.body).error).toEqual({
        code: 'CONFLICT',
        message: 'An account with this email already exists',
        details: [{ path: 'email', message: 'An account with this email already exists' }],
      });
      expect(sessionSetCookie(res)).toBeUndefined();
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.workspace.count()).toBe(1);
    });

    it('rejects invalid input with field-level details', async () => {
      const res = await register({ name: '', email: 'not-an-email', password: 'short' }).expect(
        400,
      );

      expect(apiErrorSchema.parse(res.body).error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [
          { path: 'name', message: 'Enter your name' },
          { path: 'email', message: 'Enter a valid email address' },
          { path: 'password', message: 'Use at least 8 characters' },
        ],
      });
      expect(sessionSetCookie(res)).toBeUndefined();
      expect(await prisma.user.count()).toBe(0);
    });

    it('rejects a missing body', async () => {
      const res = await request(app).post('/api/auth/register').expect(400);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await register().expect(201);
    });

    it('signs in with the right password and returns the user with their workspaces', async () => {
      const res = await logIn({ email: ' Ada@Example.com', password: ada.password }).expect(200);

      const me = meResponseSchema.parse(res.body);
      expect(me.user.email).toBe('ada@example.com');
      expect(me.workspaces.map((workspace) => workspace.role)).toEqual(['OWNER']);
      expect(sessionSetCookie(res)).toContain('HttpOnly');
    });

    it('rejects a wrong password with a generic message', async () => {
      const res = await logIn({ email: ada.email, password: 'wrong password' }).expect(401);

      expect(res.body).toEqual({
        error: { code: 'UNAUTHORIZED', message: INVALID_CREDENTIALS_MESSAGE },
      });
      expect(sessionSetCookie(res)).toBeUndefined();
    });

    it('answers an unknown email exactly like a wrong password', async () => {
      const unknown = await logIn({ email: 'nobody@example.com', password: ada.password }).expect(
        401,
      );
      const wrong = await logIn({ email: ada.email, password: 'wrong password' }).expect(401);

      expect(unknown.body).toEqual(wrong.body);
    });

    it('rejects invalid input', async () => {
      const res = await logIn({ email: 'ada', password: '' }).expect(400);

      expect(apiErrorSchema.parse(res.body).error.details).toEqual([
        { path: 'email', message: 'Enter a valid email address' },
        { path: 'password', message: 'Enter your password' },
      ]);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the user and every workspace they belong to, with their role', async () => {
      const registered = await register().expect(201);
      const cookie = sessionCookieFrom(registered);
      const me = meResponseSchema.parse(registered.body);
      const shared = await prisma.workspace.create({
        data: {
          name: 'Analytical Engines',
          slug: 'analytical-engines',
          memberships: { create: { userId: me.user.id, role: 'EDITOR' } },
        },
      });

      const res = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
      expect(meResponseSchema.parse(res.body)).toEqual({
        user: me.user,
        workspaces: [
          ...me.workspaces,
          { id: shared.id, name: 'Analytical Engines', slug: 'analytical-engines', role: 'EDITOR' },
        ],
      });
    });

    it('rejects requests without a session cookie', async () => {
      const res = await request(app).get('/api/auth/me').expect(401);

      expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Log in to continue' } });
    });

    it.each([
      ['a malformed token', () => `${SESSION_COOKIE}=not-a-jwt`],
      ['a token signed with another secret', () => sessionCookieFor('user-id', 'x'.repeat(32))],
      [
        'an expired token',
        () =>
          `${SESSION_COOKIE}=${jwt.sign({ sub: 'user-id', iss: 'formyx-api', exp: 1 }, TEST_JWT_SECRET)}`,
      ],
      [
        'an unsigned token',
        () => `${SESSION_COOKIE}=${jwt.sign({ sub: 'user-id' }, '', { algorithm: 'none' })}`,
      ],
    ])('rejects %s', async (_label, cookie) => {
      await request(app).get('/api/auth/me').set('Cookie', cookie()).expect(401);
    });

    it('rejects and clears the cookie of a user that no longer exists', async () => {
      const cookie = sessionCookieFrom(await register().expect(201));
      await prisma.user.deleteMany();

      const res = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);

      expect(sessionSetCookie(res)).toMatch(/^formyx_session=;.*Expires=Thu, 01 Jan 1970/);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie', async () => {
      const agent = request.agent(app);
      await agent.post('/api/auth/register').send(ada).expect(201);
      await agent.get('/api/auth/me').expect(200);

      const res = await agent.post('/api/auth/logout').expect(204);

      const cookie = sessionSetCookie(res);
      expect(cookie).toMatch(/^formyx_session=;/);
      expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      await agent.get('/api/auth/me').expect(401);
    });

    it('succeeds without a session', async () => {
      await request(app).post('/api/auth/logout').expect(204);
    });
  });

  describe('rate limiting', () => {
    it('limits sign-ups per IP', async () => {
      const limited = createTestApp({ AUTH_RATE_LIMIT_MAX: '2' });
      const signUp = (email: string) =>
        request(limited)
          .post('/api/auth/register')
          .send({ ...ada, email });

      await signUp('one@example.com').expect(201);
      await signUp('two@example.com').expect(201);
      const res = await signUp('three@example.com').expect(429);

      expect(res.body).toEqual({
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' },
      });
      expect(res.headers.ratelimit).toBeDefined();
    });

    it('counts failed log-ins only', async () => {
      const limited = createTestApp({ AUTH_RATE_LIMIT_MAX: '2' });
      await request(limited).post('/api/auth/register').send(ada).expect(201);
      const attempt = (password: string) =>
        request(limited).post('/api/auth/login').send({ email: ada.email, password });

      for (let i = 0; i < 3; i++) await attempt(ada.password).expect(200);
      await attempt('wrong password').expect(401);
      await attempt('wrong password').expect(401);

      // The limit now applies to every attempt from this IP, even with the right password.
      const res = await attempt(ada.password).expect(429);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
    });
  });
});
