/*
 * Throwaway inboxes: addresses that live for minutes and belong to no one. Sign-ups from them
 * are refused, so an account always has an address someone keeps. The list holds the services
 * abuse comes from in practice; it is not meant to be complete.
 */

const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  '33mail.com',
  'anonbox.net',
  'burnermail.io',
  'byom.de',
  'chacuo.net',
  'discard.email',
  'discardmail.com',
  'dispostable.com',
  'dropmail.me',
  'emailondeck.com',
  'emailfake.com',
  'fakeinbox.com',
  'fakemail.net',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'harakirimail.com',
  'inboxkitten.com',
  'incognitomail.org',
  'jetable.org',
  'mail.tm',
  'mail-temp.com',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailinator.net',
  'mailnesia.com',
  'mailpoof.com',
  'mintemail.com',
  'moakt.com',
  'mohmal.com',
  'mytemp.email',
  'nada.email',
  'sharklasers.com',
  'spam4.me',
  'spambox.us',
  'spamgourmet.com',
  'temp-mail.io',
  'temp-mail.org',
  'tempail.com',
  'tempinbox.com',
  'tempmail.com',
  'tempmail.dev',
  'tempmail.net',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'tmail.ws',
  'tmpmail.net',
  'tmpmail.org',
  'trashmail.com',
  'trashmail.de',
  'trashmail.net',
  'wegwerfmail.de',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
]);

/** Whether `email` is at a throwaway inbox service (or a subdomain of one). */
export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  const parts = domain.split('.');
  // mail.yopmail.com is as disposable as yopmail.com.
  return parts.some((_, index) => DISPOSABLE_DOMAINS.has(parts.slice(index).join('.')));
}

export const DISPOSABLE_EMAIL_MESSAGE =
  'Use an email address you keep: temporary inboxes can’t be used for an account.';
