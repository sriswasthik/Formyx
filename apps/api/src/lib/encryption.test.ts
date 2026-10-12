import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../config/env.js';
import {
  createEncryption,
  DERIVED_KEY_ID,
  derivedKey,
  encryptionFromEnv,
  KeyRingError,
  newKeyEntry,
  parseKeyRing,
} from './encryption.js';
import { createSecretBox } from './webhook-signature.js';

const JWT_SECRET = 'a-jwt-secret-that-is-at-least-32-characters';
const key = (id: string) => ({ id, key: randomBytes(32) });

describe('createEncryption', () => {
  const ring = createEncryption({ keys: [key('k2'), key('k1')], legacySecret: JWT_SECRET });

  it('seals and opens, with a fresh IV each time', () => {
    const token = '1//refresh-token-from-google';
    const first = ring.encrypt(token);
    const second = ring.encrypt(token);
    expect(first).not.toBe(second);
    expect(first).not.toContain(token);
    expect(first.startsWith('v2.k2.')).toBe(true);
    expect(ring.decrypt(first)).toBe(token);
    expect(ring.decrypt(second)).toBe(token);
  });

  it('refuses anything changed, including the key id', () => {
    const sealed = ring.encrypt('secret');
    const parts = sealed.split('.');
    const flipped = (part: string) =>
      Buffer.from(part, 'base64url').map((byte, index) => (index === 0 ? byte ^ 1 : byte));
    const ciphertext = [...parts];
    ciphertext[4] = Buffer.from(flipped(parts[4] ?? '')).toString('base64url');
    expect(() => ring.decrypt(ciphertext.join('.'))).toThrow();

    const tag = [...parts];
    tag[3] = Buffer.from(flipped(parts[3] ?? '')).toString('base64url');
    expect(() => ring.decrypt(tag.join('.'))).toThrow();

    // Claiming another key in the ring fails authentication.
    expect(() => ring.decrypt(sealed.replace('v2.k2.', 'v2.k1.'))).toThrow();
    expect(() => ring.decrypt('not sealed')).toThrow(KeyRingError);
  });

  it('cannot be opened with another key', () => {
    const other = createEncryption({ keys: [key('k2')], legacySecret: JWT_SECRET });
    expect(() => other.decrypt(ring.encrypt('secret'))).toThrow();
  });

  it('opens values sealed with an older key, and says they need sealing again', () => {
    const older = createEncryption({ keys: [key('k1')], legacySecret: JWT_SECRET });
    const k1 = key('k1');
    const before = createEncryption({ keys: [k1], legacySecret: JWT_SECRET });
    const after = createEncryption({ keys: [key('k2'), k1], legacySecret: JWT_SECRET });

    const sealed = before.encrypt('webhook secret');
    expect(after.decrypt(sealed)).toBe('webhook secret');
    expect(after.needsReseal(sealed)).toBe(true);
    expect(after.needsReseal(after.encrypt('webhook secret'))).toBe(false);
    expect(() => older.decrypt(sealed)).toThrow(/not in ENCRYPTION_KEYS|unable|auth/i);
  });

  it('opens secrets sealed before the key ring, keyed from JWT_SECRET', () => {
    const legacy = createSecretBox(JWT_SECRET).encrypt('whsec_old');
    expect(legacy.startsWith('v1.')).toBe(true);
    expect(ring.decrypt(legacy)).toBe('whsec_old');
    expect(ring.needsReseal(legacy)).toBe(true);
  });
});

describe('parseKeyRing', () => {
  it('reads keys newest first', () => {
    const [first, second] = [newKeyEntry('k2'), newKeyEntry('k1')];
    expect(parseKeyRing(` ${first} , ${second} `).map((entry) => entry.id)).toEqual(['k2', 'k1']);
  });

  it('refuses short keys, bad ids and repeated ids', () => {
    expect(() => parseKeyRing('k1:c2hvcnQ=')).toThrow(/32 bytes/);
    expect(() => parseKeyRing(`K 1:${randomBytes(32).toString('base64')}`)).toThrow(/id/);
    const entry = newKeyEntry('k1');
    expect(() => parseKeyRing(`${entry},${entry}`)).toThrow(/different/);
    expect(() => parseKeyRing(' , ')).toThrow(/at least one/);
  });
});

describe('encryptionFromEnv', () => {
  const env = (extra: Record<string, string> = {}) =>
    parseEnv({
      DATABASE_URL: 'postgresql://localhost/formyx',
      JWT_SECRET,
      ...extra,
    });

  it('derives a key from JWT_SECRET when no keys are set', () => {
    const encryption = encryptionFromEnv(env());
    expect(encryption.currentKeyId).toBe(DERIVED_KEY_ID);
    expect(encryption.decrypt(encryption.encrypt('token'))).toBe('token');
  });

  it('seals with the first configured key, and still opens what the derived key sealed', () => {
    const development = encryptionFromEnv(env()).encrypt('token');
    const encryption = encryptionFromEnv(env({ ENCRYPTION_KEYS: newKeyEntry('prod-1') }));
    expect(encryption.currentKeyId).toBe('prod-1');
    expect(encryption.decrypt(development)).toBe('token');
    expect(encryption.needsReseal(development)).toBe(true);
    expect(derivedKey(JWT_SECRET).key).toHaveLength(32);
  });

  it('rejects a malformed ENCRYPTION_KEYS at start-up', () => {
    expect(() => env({ ENCRYPTION_KEYS: 'nope' })).toThrow(/ENCRYPTION_KEYS/);
  });
});
