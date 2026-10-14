import { createHmac, timingSafeEqual } from 'node:crypto';

/*
 * The token in a lifecycle email's unsubscribe link: the account's id and a signature over it,
 * so one click turns those emails off without signing in, and nobody can forge a link for
 * someone else. It never expires: an old email's link must keep working.
 */

const PURPOSE = 'formyx:unsubscribe:v1';

function sign(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${PURPOSE}:${userId}`).digest('base64url');
}

export function createUnsubscribeToken(userId: string, secret: string): string {
  return `${Buffer.from(userId).toString('base64url')}.${sign(userId, secret)}`;
}

/** The account a token belongs to, or `null` if it is malformed or not ours. */
export function readUnsubscribeToken(token: string, secret: string): string | null {
  const [encoded, signature, ...rest] = token.split('.');
  if (!encoded || !signature || rest.length > 0) return null;
  const userId = Buffer.from(encoded, 'base64url').toString('utf8');
  if (!/^[\w-]{1,64}$/.test(userId)) return null;
  const expected = Buffer.from(sign(userId, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? userId : null;
}
