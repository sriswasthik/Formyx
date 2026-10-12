import { z } from 'zod';
import type { Encryption } from '../lib/encryption.js';
import type { Database } from '../lib/prisma.js';
import { refreshGoogleTokens, type GoogleEnv, type GoogleTokens } from './google.js';

/*
 * An integration's OAuth tokens, sealed with the key ring (lib/encryption.ts) in
 * `integrations.credentials_encrypted`. They are opened only inside jobs and the OAuth
 * callback, never logged, and never sent to a browser.
 */

const googleCredentialsSchema = z.object({
  kind: z.literal('google'),
  accessToken: z.string(),
  expiresAt: z.number(),
  refreshToken: z.string(),
});
const notionCredentialsSchema = z.object({
  kind: z.literal('notion'),
  accessToken: z.string(),
});
export const credentialsSchema = z.discriminatedUnion('kind', [
  googleCredentialsSchema,
  notionCredentialsSchema,
]);
export type Credentials = z.infer<typeof credentialsSchema>;

/** The stored credentials can't be read (the key was dropped, say): connect again. */
export class CredentialsError extends Error {
  constructor() {
    super('The account’s access can’t be read. Connect it again.');
    this.name = 'CredentialsError';
  }
}

export function sealCredentials(encryption: Encryption, credentials: Credentials): string {
  return encryption.encrypt(JSON.stringify(credentials));
}

export function openCredentials(encryption: Encryption, sealed: string | null): Credentials {
  if (!sealed) throw new CredentialsError();
  try {
    return credentialsSchema.parse(JSON.parse(encryption.decrypt(sealed)));
  } catch {
    throw new CredentialsError();
  }
}

/** Refresh a little early, so a token never expires mid-request. */
const EXPIRY_MARGIN_MS = 60_000;

/**
 * Hands out a valid Google access token for an integration, refreshing it when it is about to
 * expire and storing the refreshed (and resealed) tokens.
 */
export function googleAccess({
  prisma,
  encryption,
  env,
  integrationId,
  sealed,
}: {
  prisma: Database;
  encryption: Encryption;
  env: GoogleEnv;
  integrationId: string;
  sealed: string | null;
}): (force?: boolean) => Promise<string> {
  const opened = openCredentials(encryption, sealed);
  if (opened.kind !== 'google') throw new CredentialsError();
  let tokens: GoogleTokens = opened;
  let stale = sealed !== null && encryption.needsReseal(sealed);

  return async (force = false) => {
    if (force || tokens.expiresAt - EXPIRY_MARGIN_MS <= Date.now()) {
      tokens = await refreshGoogleTokens(env, tokens);
      stale = true;
    }
    if (stale) {
      stale = false;
      await prisma.integration.update({
        where: { id: integrationId },
        data: { credentialsEncrypted: sealCredentials(encryption, { kind: 'google', ...tokens }) },
      });
    }
    return tokens.accessToken;
  };
}
