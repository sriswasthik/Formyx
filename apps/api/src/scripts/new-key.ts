import { newKeyEntry } from '../lib/encryption.js';

/*
 * Prints a new key for ENCRYPTION_KEYS. Put it first in the list to rotate: new secrets use it,
 * older ones still open with the keys after it until they are sealed again.
 *
 *   pnpm --filter @formyx/api keys:new [id]
 */
const id = process.argv[2] ?? `k${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;
process.stdout.write(`${newKeyEntry(id)}\n`);
