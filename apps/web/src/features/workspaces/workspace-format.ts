import { ROLE_LABELS, type Role } from '@formyx/shared';

/** What each role may do, in a few words. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: 'Everything, including members and deleting the workspace',
  EDITOR: 'Build forms and manage responses',
  VIEWER: 'See forms and responses',
};

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** "Expires in 6 days", "Expires in 3 hours", "Expires in under an hour", or "Expired". */
export function inviteExpiry(expiresAt: string, now: Date): { label: string; expired: boolean } {
  const left = new Date(expiresAt).getTime() - now.getTime();
  if (left <= 0) return { label: 'Expired', expired: true };
  if (left < HOUR) return { label: 'Expires in under an hour', expired: false };
  if (left < DAY) {
    const hours = Math.floor(left / HOUR);
    return { label: `Expires in ${hours} ${hours === 1 ? 'hour' : 'hours'}`, expired: false };
  }
  const days = Math.floor(left / DAY);
  return { label: `Expires in ${days} ${days === 1 ? 'day' : 'days'}`, expired: false };
}

/** "A" for "Ada Lovelace"; "?" when there is nothing to go on. */
export function initial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?';
}

/** "an owner", "an editor", "a viewer" */
export function roleWithArticle(role: Role): string {
  const label = ROLE_LABELS[role].toLowerCase();
  return `${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label}`;
}
