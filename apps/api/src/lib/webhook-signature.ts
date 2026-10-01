import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

/**
 * The X-Formyx-Signature header for `body`: `sha256=` and the hex HMAC-SHA256 of the exact
 * bytes sent, keyed with the webhook's secret. Receivers compute the same over the raw body.
 */
export function signWebhookBody(body: string, secret: string): string {
  return `${SIGNATURE_PREFIX}${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

/** Checks a signature the way receivers should: in constant time. */
export function verifyWebhookSignature(body: string, secret: string, signature: string): boolean {
  const expected = Buffer.from(signWebhookBody(body, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A new signing secret: 256 random bits, prefixed so people can tell what it is. */
export function newWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

export interface SecretBox {
  encrypt(plaintext: string): string;
  /** Throws if the value was not made by this box (wrong key, or tampered with). */
  decrypt(sealed: string): string;
}

const VERSION = 'v1';

/**
 * Encrypts webhook secrets at rest with AES-256-GCM. The key is derived from JWT_SECRET with
 * HKDF, so a copy of the database alone does not reveal them. Changing JWT_SECRET makes stored
 * secrets unreadable: webhooks then need to be added again.
 */
export function createSecretBox(masterSecret: string): SecretBox {
  const key = Buffer.from(
    hkdfSync('sha256', masterSecret, 'formyx', 'webhook-signing-secrets', 32),
  );

  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [VERSION, iv, cipher.getAuthTag(), ciphertext]
        .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
        .join('.');
    },

    decrypt(sealed) {
      const [version, iv, tag, ciphertext] = sealed.split('.');
      if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
        throw new Error('Not a sealed webhook secret');
      }
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
