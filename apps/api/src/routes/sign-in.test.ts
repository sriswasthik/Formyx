import { meResponseSchema } from '@formyx/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIGN_IN_COOKIE } from '../sign-in/flow.js';
import { createFakeMailer, startTestServer, type TestServer } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import {
  FAKE_CLIENTS,
  startFakeSignIn,
  type FakeClaims,
  type FakeSignIn,
} from '../test/fake-sign-in.js';

const APP = 'https://app.formyx.test';
const ada: FakeClaims = {
  sub: 'google-ada',
  email: 'Ada@Example.com',
  email_verified: true,
  name: 'Ada Lovelace',
};

let fake: FakeSignIn;
let server: TestServer;
let mailer: ReturnType<typeof createFakeMailer>;

beforeAll(async () => {
  fake = await startFakeSignIn();
});
afterAll(async () => {
  await fake.close();
});

beforeEach(async () => {
  await resetDatabase();
  fake.tokenRequests.length = 0;
  mailer = createFakeMailer();
  server = await startTestServer({ mailer, env: fake.env });
});
afterEach(async () => {
  await server.close();
});

type Agent = ReturnType<typeof request.agent>;

/** Starts signing in, has the provider agree as `claims`, and follows it back. */
async function signIn(
  provider: 'google' | 'zoho',
  claims: FakeClaims,
  {
    agent = request.agent(server.app),
    start = {},
    callback = {},
  }: { agent?: Agent; start?: Record<string, string>; callback?: Record<string, string> } = {},
) {
  const started = await agent.get(`/api/auth/oauth/${provider}`).query(start).expect(303);
  const authorize = new URL(started.headers.location ?? '');
  const code = fake.issue(provider, authorize.searchParams.get('code_challenge') ?? '', claims);
  const back = await agent
    .get(`/api/auth/oauth/${provider}/callback`)
    .query({ code, state: authorize.searchParams.get('state') ?? '', ...callback })
    .expect(303);
  return { agent, authorize, started, location: back.headers.location ?? '', back };
}

async function me(agent: Agent) {
  return meResponseSchema.parse((await agent.get('/api/auth/me').expect(200)).body);
}

function welcomes() {
  return mailer.sent.filter(({ idempotencyKey }) => idempotencyKey.endsWith(':welcome:'));
}

describe('GET /api/auth/providers', () => {
  it('lists the providers this server is set up for', async () => {
    const res = await request(server.app).get('/api/auth/providers').expect(200);
    expect(res.body).toEqual({ providers: ['google', 'zoho'] });
  });

  it('lists none without their settings', async () => {
    const bare = await startTestServer();
    try {
      const res = await request(bare.app).get('/api/auth/providers').expect(200);
      expect(res.body).toEqual({ providers: [] });
    } finally {
      await bare.close();
    }
  });
});

describe('starting', () => {
  it('sends people to Google with PKCE, a signed state and a cookie for this browser', async () => {
    const res = await request(server.app).get('/api/auth/oauth/google').expect(303);
    const authorize = new URL(res.headers.location ?? '');
    expect(`${authorize.origin}${authorize.pathname}`).toBe(`${fake.google}/o/oauth2/v2/auth`);
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      client_id: FAKE_CLIENTS.google.id,
      redirect_uri: `${APP}/api/auth/oauth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    expect(authorize.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(authorize.searchParams.get('state')).toBeTruthy();
    const cookie = res.get('Set-Cookie')?.find((c) => c.startsWith(`${SIGN_IN_COOKIE}=`));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('sends people to Zoho at the configured data centre', async () => {
    const res = await request(server.app).get('/api/auth/oauth/zoho').expect(303);
    const authorize = new URL(res.headers.location ?? '');
    expect(`${authorize.origin}${authorize.pathname}`).toBe(`${fake.zoho}/oauth/v2/auth`);
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${APP}/api/auth/oauth/zoho/callback`);
  });

  it('sends people back when the provider is not set up', async () => {
    const bare = await startTestServer();
    try {
      const res = await request(bare.app).get('/api/auth/oauth/zoho?page=signup').expect(303);
      expect(res.headers.location).toBe(`${APP}/signup?sign_in_error=unavailable&provider=zoho`);
    } finally {
      await bare.close();
    }
  });

  it('refuses providers it does not know', async () => {
    const res = await request(server.app).get('/api/auth/oauth/github').expect(303);
    expect(res.headers.location).toBe(`${APP}/login`);
  });
});

describe('the first sign-in', () => {
  it('makes an account without a password, signs them in and welcomes them', async () => {
    const { agent, location, back } = await signIn('google', ada);

    expect(location).toBe(`${APP}/app`);
    // The round trip's cookie is spent.
    expect(back.get('Set-Cookie')?.find((c) => c.startsWith(`${SIGN_IN_COOKIE}=;`))).toBeDefined();
    const session = await me(agent);
    expect(session.user).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      hasPassword: false,
    });
    expect(session.workspaces).toEqual([
      expect.objectContaining({ name: "Ada's workspace", role: 'OWNER' }),
    ]);
    expect(await prisma.signInIdentity.findMany()).toEqual([
      expect.objectContaining({
        userId: session.user.id,
        provider: 'google',
        subject: 'google-ada',
        email: 'ada@example.com',
      }),
    ]);

    await vi.waitFor(() => {
      expect(welcomes()).toHaveLength(1);
    });
    const [welcome] = welcomes()[0]?.messages ?? [];
    expect(welcome).toMatchObject({ to: 'ada@example.com', subject: 'Welcome to Formyx' });
    expect(welcome?.text).toContain('Welcome to Formyx, Ada');
  });

  it('sends the PKCE verifier and the client secret to the provider', async () => {
    await signIn('google', ada);
    const [exchange] = fake.tokenRequests;
    expect(exchange?.params).toMatchObject({
      client_secret: FAKE_CLIENTS.google.secret,
      redirect_uri: `${APP}/api/auth/oauth/google/callback`,
    });
    expect(exchange?.params.code_verifier).toMatch(/^[\w-]{43}$/);
  });

  it('works the same through Zoho, naming them from their first and last names', async () => {
    const { agent } = await signIn('zoho', {
      sub: 'zoho-grace',
      email: 'grace@example.com',
      email_verified: 'true',
      first_name: 'Grace',
      last_name: 'Hopper',
    });
    expect((await me(agent)).user).toMatchObject({ name: 'Grace Hopper', hasPassword: false });
  });

  it('names them from their email when the provider gives no name', async () => {
    const { agent } = await signIn('google', {
      sub: 'g-1',
      email: 'ken@example.com',
      email_verified: true,
    });
    expect((await me(agent)).user.name).toBe('ken');
  });

  it('keeps the referral and what brought them, as signing up with a password does', async () => {
    await signIn('google', ada, { start: { source: 'badge', page: 'signup' } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
    expect(user.signupSource).toBe('badge');
  });
});

describe('signing in again', () => {
  it('reaches the same account without welcoming them twice', async () => {
    const first = await signIn('google', ada);
    const firstMe = await me(first.agent);
    await vi.waitFor(() => {
      expect(welcomes()).toHaveLength(1);
    });

    // A new email at Google still reaches the account, through the lasting id.
    const second = await signIn('google', { ...ada, email: 'ada@new.example.com' });
    expect((await me(second.agent)).user.id).toBe(firstMe.user.id);
    expect(await prisma.user.count()).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(welcomes()).toHaveLength(1);
  });

  it('goes where they were going, but only inside the app', async () => {
    expect((await signIn('google', ada, { start: { next: '/invite/abc_123' } })).location).toBe(
      `${APP}/invite/abc_123`,
    );
    expect(
      (await signIn('google', ada, { start: { next: 'https://evil.example/app' } })).location,
    ).toBe(`${APP}/app`);
    expect((await signIn('google', ada, { start: { next: '//evil.example' } })).location).toBe(
      `${APP}/app`,
    );
  });
});

describe('an account with the same email', () => {
  async function registerAda() {
    await request(server.app)
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' })
      .expect(201);
  }

  it('is linked when the provider has confirmed the email, and the password still works', async () => {
    await registerAda();
    const { agent, location } = await signIn('google', ada);
    expect(location).toBe(`${APP}/app`);
    const session = await me(agent);
    expect(session.user.email).toBe('ada@example.com');
    expect(session.user.hasPassword).toBeUndefined();
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.signInIdentity.count({ where: { userId: session.user.id } })).toBe(1);
    await request(server.app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'correct horse battery' })
      .expect(200);
  });

  it('is not reached when the provider has not confirmed the email', async () => {
    await registerAda();
    const { agent, location } = await signIn(
      'zoho',
      { ...ada, email_verified: false },
      {
        start: { page: 'signup' },
      },
    );
    expect(location).toBe(`${APP}/signup?sign_in_error=unverified_email&provider=zoho`);
    expect(await prisma.signInIdentity.count()).toBe(0);
    await agent.get('/api/auth/me').expect(401);
  });

  it('never reaches the demo account', async () => {
    await prisma.user.create({
      data: { name: 'Demo', email: 'ada@example.com', passwordHash: 'x', isDemo: true },
    });
    const { location } = await signIn('google', ada);
    expect(location).toBe(`${APP}/login?sign_in_error=failed&provider=google`);
  });
});

describe('refusals', () => {
  it('refuses a callback this browser did not start (login CSRF)', async () => {
    const started = await request(server.app).get('/api/auth/oauth/google').expect(303);
    const authorize = new URL(started.headers.location ?? '');
    const code = fake.issue('google', authorize.searchParams.get('code_challenge') ?? '', ada);
    // Another browser: no cookie.
    const res = await request(server.app)
      .get('/api/auth/oauth/google/callback')
      .query({ code, state: authorize.searchParams.get('state') ?? '' })
      .expect(303);
    expect(res.headers.location).toBe(`${APP}/login?sign_in_error=expired&provider=google`);
    expect(fake.tokenRequests).toHaveLength(0);
    expect(await prisma.user.count()).toBe(0);
  });

  it('refuses a state that is not ours, or for the other provider', async () => {
    const agent = request.agent(server.app);
    const started = await agent.get('/api/auth/oauth/google').expect(303);
    const state = new URL(started.headers.location ?? '').searchParams.get('state') ?? '';
    const zoho = await agent
      .get('/api/auth/oauth/zoho/callback')
      .query({ code: 'x', state })
      .expect(303);
    expect(zoho.headers.location).toBe(`${APP}/login?sign_in_error=expired&provider=zoho`);

    await agent.get('/api/auth/oauth/google').expect(303);
    const forged = await agent
      .get('/api/auth/oauth/google/callback')
      .query({ code: 'x', state: `${state}x` })
      .expect(303);
    expect(forged.headers.location).toBe(`${APP}/login?sign_in_error=expired&provider=google`);
  });

  it('says so when they cancel at the provider', async () => {
    const agent = request.agent(server.app);
    const started = await agent.get('/api/auth/oauth/google?page=signup').expect(303);
    const state = new URL(started.headers.location ?? '').searchParams.get('state') ?? '';
    const res = await agent
      .get('/api/auth/oauth/google/callback')
      .query({ error: 'access_denied', state })
      .expect(303);
    expect(res.headers.location).toBe(`${APP}/signup?sign_in_error=cancelled&provider=google`);
  });

  it('refuses an ID token meant for another app', async () => {
    const { location } = await signIn('google', { ...ada, aud: 'someone-else' });
    expect(location).toBe(`${APP}/login?sign_in_error=failed&provider=google`);
    expect(await prisma.user.count()).toBe(0);
  });

  it('refuses a code the provider does not take', async () => {
    const agent = request.agent(server.app);
    const started = await agent.get('/api/auth/oauth/zoho').expect(303);
    const state = new URL(started.headers.location ?? '').searchParams.get('state') ?? '';
    const res = await agent
      .get('/api/auth/oauth/zoho/callback')
      .query({ code: 'made-up', state })
      .expect(303);
    expect(res.headers.location).toBe(`${APP}/login?sign_in_error=failed&provider=zoho`);
  });

  it('never sends the client secret to a Zoho data centre that is not Zoho', async () => {
    const { location } = await signIn(
      'zoho',
      { ...ada, sub: 'z' },
      {
        callback: { 'accounts-server': 'https://accounts.evil.example' },
      },
    );
    expect(location).toBe(`${APP}/login?sign_in_error=failed&provider=zoho`);
    expect(fake.tokenRequests).toHaveLength(0);
  });

  it('trades the code at the Zoho data centre named, when it is a known one', async () => {
    const { location } = await signIn(
      'zoho',
      { ...ada, sub: 'z' },
      {
        callback: { 'accounts-server': fake.zoho },
      },
    );
    expect(location).toBe(`${APP}/app`);
  });
});

describe('an account without a password', () => {
  it('can not log in with one', async () => {
    await signIn('google', ada);
    const res = await request(server.app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'anything at all' })
      .expect(401);
    expect(res.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('can set a first password, once, and then log in with it', async () => {
    const { agent } = await signIn('google', ada);
    await agent
      .post('/api/account/password')
      .send({ currentPassword: 'guess', newPassword: 'a brand new password' })
      .expect(409);
    await agent
      .post('/api/account/password/set')
      .send({ newPassword: 'a brand new password' })
      .expect(204);
    // The fresh cookie keeps this session going.
    expect((await me(agent)).user.hasPassword).toBeUndefined();
    await agent
      .post('/api/account/password/set')
      .send({ newPassword: 'another password' })
      .expect(409);
    await request(server.app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'a brand new password' })
      .expect(200);
  });

  it('is set to be deleted once its email is typed out', async () => {
    const { agent } = await signIn('google', ada);
    const wrong = await agent
      .post('/api/account/delete')
      .send({ email: 'someone@example.com' })
      .expect(400);
    expect(wrong.body).toMatchObject({ error: { code: 'WRONG_CODE' } });
    await agent.post('/api/account/delete').send({ email: ' ADA@example.com ' }).expect(202);
    // Deleted a week later (see privacy.test.ts); until then it waits.
    const user = await prisma.user.findFirstOrThrow();
    expect(user.deletionScheduledFor).not.toBeNull();
  });

  it('needs the password, not the email, once there is one', async () => {
    const { agent } = await signIn('google', ada);
    await agent
      .post('/api/account/password/set')
      .send({ newPassword: 'a brand new password' })
      .expect(204);
    await agent.post('/api/account/delete').send({ email: 'ada@example.com' }).expect(400);
    expect(await prisma.user.count()).toBe(1);
  });
});
