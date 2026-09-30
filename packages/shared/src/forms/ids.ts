const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 10;

/** Ids of fields, options and other nodes inside a form schema. */
export const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

interface RandomSource {
  getRandomValues<T extends Uint8Array>(array: T): T;
}

// Web Crypto exists in browsers and Node alike, but this package only has the ES library
// typings, which do not declare it.
const webCrypto = (globalThis as unknown as { crypto?: RandomSource }).crypto;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (webCrypto) return webCrypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/** A short random id such as `fld_k3j9x2m1q0`. Unique enough for ids within one form. */
export function createId(prefix: string): string {
  const suffix = Array.from(randomBytes(ID_LENGTH), (byte) => ID_ALPHABET[byte % 36]).join('');
  return `${prefix}_${suffix}`;
}
