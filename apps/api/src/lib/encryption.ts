import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { createSecretBox, type SecretBox } from './webhook-signature.js';

/*
 * Secrets at rest (integration tokens, webhook signing secrets, chat webhook URLs), sealed
 * with AES-256-GCM under a key ring: `ENCRYPTION_KEYS` lists keys with an id each, newest
 * first. New values use the first key; any listed key opens what it sealed, so a key can be
 * rotated by putting a new one first and, once everything is resealed, dropping the old one.
 *
 * Sealed values read `v2.<key id>.<iv>.<tag>.<ciphertext>` (base64url). Values from before
 * the key ring (`v1.…`, keyed from JWT_SECRET) still open, and `needsReseal` says so, so
 * callers can store them again under the current key.
 */

export const KEY_LENGTH = 32;
const VERSION = 'v2';
const KEY_ID_PATTERN = /^[a-z0-9-]{1,16}$/;
/** The key used when ENCRYPTION_KEYS is not set: derived from JWT_SECRET (development). */
export const DERIVED_KEY_ID = 'jwt';

export interface EncryptionKey {
  id: string;
  key: Buffer;
}

export interface Encryption extends SecretBox {
  /** Whether `sealed` is under an older key or format, and worth sealing again. */
  needsReseal(sealed: string): boolean;
  /** The id of the key new values are sealed with. */
  currentKeyId: string;
}

export class KeyRingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyRingError';
  }
}

/** Reads `kid:base64key,kid:base64key` (newest first). */
export function parseKeyRing(value: string): EncryptionKey[] {
  const keys = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(':');
      const id = entry.slice(0, separator);
      if (separator < 1 || !KEY_ID_PATTERN.test(id)) {
        throw new KeyRingError(
          'Each key is "<id>:<base64 key>", with an id of lowercase letters, digits and -',
        );
      }
      const key = Buffer.from(entry.slice(separator + 1), 'base64');
      if (key.length !== KEY_LENGTH) {
        throw new KeyRingError(`Key "${id}" must be ${KEY_LENGTH} bytes (44 base64 characters)`);
      }
      return { id, key };
    });
  if (keys.length === 0) throw new KeyRingError('List at least one key');
  if (new Set(keys.map((key) => key.id)).size !== keys.length) {
    throw new KeyRingError('Key ids must be different');
  }
  return keys;
}

/** A key from JWT_SECRET, for development without ENCRYPTION_KEYS. */
export function derivedKey(jwtSecret: string): EncryptionKey {
  return {
    id: DERIVED_KEY_ID,
    key: Buffer.from(hkdfSync('sha256', jwtSecret, 'formyx', 'secrets-at-rest', KEY_LENGTH)),
  };
}

/** A new random key, as ENCRYPTION_KEYS expects it, for `pnpm --filter @formyx/api keys:new`. */
export function newKeyEntry(id: string): string {
  if (!KEY_ID_PATTERN.test(id)) throw new KeyRingError('Use lowercase letters, digits and -');
  return `${id}:${randomBytes(KEY_LENGTH).toString('base64')}`;
}

export function createEncryption({
  keys,
  legacySecret,
}: {
  /** Newest first. */
  keys: readonly EncryptionKey[];
  /** JWT_SECRET, to open values sealed before the key ring. */
  legacySecret: string;
}): Encryption {
  const [current] = keys;
  if (!current) throw new KeyRingError('List at least one key');
  const byId = new Map(keys.map((entry) => [entry.id, entry.key]));
  const legacy = createSecretBox(legacySecret);

  return {
    currentKeyId: current.id,

    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', current.key, iv);
      // The key id is authenticated too: a value cannot be passed off as another key's.
      cipher.setAAD(Buffer.from(current.id));
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [
        VERSION,
        current.id,
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        ciphertext.toString('base64url'),
      ].join('.');
    },

    decrypt(sealed) {
      if (sealed.startsWith('v1.')) return legacy.decrypt(sealed);
      const [version, id, iv, tag, ciphertext, ...rest] = sealed.split('.');
      if (version !== VERSION || !id || !iv || !tag || ciphertext === undefined || rest.length) {
        throw new KeyRingError('Not a sealed value');
      }
      const key = byId.get(id);
      if (!key) throw new KeyRingError(`Sealed with key "${id}", which is not in ENCRYPTION_KEYS`);
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(id));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },

    needsReseal(sealed) {
      return !sealed.startsWith(`${VERSION}.${current.id}.`);
    },
  };
}

/** The app's encryption, from its environment. */
export function encryptionFromEnv(env: {
  ENCRYPTION_KEYS?: EncryptionKey[] | undefined;
  JWT_SECRET: string;
}): Encryption {
  const derived = derivedKey(env.JWT_SECRET);
  // The derived key stays last (it never seals once real keys are set), so values sealed
  // before ENCRYPTION_KEYS was set still open and get resealed.
  const keys = env.ENCRYPTION_KEYS
    ? [...env.ENCRYPTION_KEYS.filter((entry) => entry.id !== DERIVED_KEY_ID), derived]
    : [derived];
  return createEncryption({ keys, legacySecret: env.JWT_SECRET });
}
