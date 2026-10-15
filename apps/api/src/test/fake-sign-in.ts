import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/*
 * Google's and Zoho's token endpoints, in memory on 127.0.0.1, for sign-in tests. Point
 * GOOGLE_OAUTH_URL and GOOGLE_TOKEN_URL at `google`, and ZOHO_ACCOUNTS_URL at `zoho`; `env`
 * has all of it. A test starts signing in, then asks for a code for the challenge it was sent
 * (`issue`), and the token endpoint only takes it with the matching PKCE verifier and secret.
 */

export const FAKE_CLIENTS = {
  google: { id: 'google-client', secret: 'google-secret' },
  zoho: { id: 'zoho-client', secret: 'zoho-secret' },
} as const;

type Provider = keyof typeof FAKE_CLIENTS;

export interface FakeClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  first_name?: string;
  last_name?: string;
  /** Overrides, to test tokens that must be refused. */
  aud?: string;
  iss?: string;
  exp?: number;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

export async function startFakeSignIn() {
  const codes = new Map<string, { provider: Provider; challenge: string; claims: FakeClaims }>();
  const tokenRequests: { provider: Provider; params: Record<string, string> }[] = [];
  let base = '';

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };

  const server = createServer((req, res) => {
    void (async () => {
      const path = new URL(req.url ?? '/', 'http://fake').pathname;
      const provider: Provider | null =
        path === '/google/token' ? 'google' : path === '/zoho/oauth/v2/token' ? 'zoho' : null;
      if (!provider || req.method !== 'POST') {
        send(res, 404, { error: 'not_found' });
        return;
      }
      const params = Object.fromEntries(new URLSearchParams(await readBody(req)));
      tokenRequests.push({ provider, params });
      const issued = codes.get(params.code ?? '');
      const client = FAKE_CLIENTS[provider];
      if (
        issued?.provider !== provider ||
        params.client_id !== client.id ||
        params.client_secret !== client.secret ||
        params.grant_type !== 'authorization_code' ||
        sha256(params.code_verifier ?? '') !== issued.challenge
      ) {
        // Zoho answers 200 with an error, Google 400.
        send(res, provider === 'zoho' ? 200 : 400, { error: 'invalid_code' });
        return;
      }
      codes.delete(params.code ?? '');
      const claims = {
        iss: `${base}/${provider}`,
        aud: client.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...issued.claims,
      };
      send(res, 200, {
        access_token: 'access',
        expires_in: 3600,
        id_token: `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`,
      });
    })().catch((error: unknown) => {
      send(res, 500, { error: String(error) });
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;

  return {
    google: `${base}/google`,
    zoho: `${base}/zoho`,
    /** Settings that point both providers here. */
    env: {
      GOOGLE_CLIENT_ID: FAKE_CLIENTS.google.id,
      GOOGLE_CLIENT_SECRET: FAKE_CLIENTS.google.secret,
      GOOGLE_OAUTH_URL: `${base}/google`,
      GOOGLE_TOKEN_URL: `${base}/google`,
      ZOHO_CLIENT_ID: FAKE_CLIENTS.zoho.id,
      ZOHO_CLIENT_SECRET: FAKE_CLIENTS.zoho.secret,
      ZOHO_ACCOUNTS_URL: `${base}/zoho`,
    },
    tokenRequests,
    /** A code the token endpoint trades for an ID token with `claims`, once. */
    issue(provider: Provider, challenge: string, claims: FakeClaims): string {
      const code = randomBytes(8).toString('hex');
      codes.set(code, { provider, challenge, claims });
      return code;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

export type FakeSignIn = Awaited<ReturnType<typeof startFakeSignIn>>;
