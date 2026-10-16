/*
 * What an account may do in its first days, in one place. Most abuse comes from accounts made
 * minutes before: they get a smaller response allowance and can't send people elsewhere or
 * email respondents until the account is older. The API enforces these; the app explains them.
 */

export interface NewAccountLimits {
  hours: number;
  responses: number;
  redirects: boolean;
  autoresponders: boolean;
  autoresponderLinks: boolean;
}

export const NEW_ACCOUNT_LIMITS: Readonly<NewAccountLimits> = {
  /** How long an account counts as new. */
  hours: 72,
  /** Responses all of a new account's forms may take together. */
  responses: 50,
  /** End screens may redirect to another site. */
  redirects: false,
  /** Forms may email respondents a confirmation. */
  autoresponders: false,
  /** Autoresponder emails may carry links (when autoresponders are allowed at all). */
  autoresponderLinks: false,
};

/** Confirmation emails one workspace's forms may send in a day, however old the account. */
export const AUTORESPONDERS_PER_DAY = 200;

/** Whether an account made at `createdAt` is still new at `now`. */
export function isNewAccount(createdAt: Date | string, now: Date = new Date()): boolean {
  const made = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  return now.getTime() - made.getTime() < NEW_ACCOUNT_LIMITS.hours * 60 * 60 * 1000;
}

/** When an account made at `createdAt` stops being new. */
export function newAccountEndsAt(createdAt: Date | string): Date {
  const made = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  return new Date(made.getTime() + NEW_ACCOUNT_LIMITS.hours * 60 * 60 * 1000);
}
