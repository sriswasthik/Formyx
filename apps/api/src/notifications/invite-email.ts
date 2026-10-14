import { INVITE_TTL_DAYS, ROLE_LABELS, type Role } from '@formyx/shared';
import {
  button,
  COLOR,
  emailPage,
  escapeHtml,
  heading,
  paragraph as p,
  singleLine,
  type RenderedEmail,
} from './email-layout.js';

export interface InviteEmailInput {
  /** The site's address, for the logo. */
  appUrl: string;
  workspaceName: string;
  /** Who sent it; `null` if their account is gone. */
  inviterName: string | null;
  role: Role;
  /** The page that accepts the invite; it carries the secret token. */
  acceptUrl: string;
}

const ROLE_ABILITIES: Record<Role, string> = {
  OWNER: 'manage its members and everything in it',
  EDITOR: 'build forms and manage their responses',
  VIEWER: 'see its forms and responses',
};

export function renderInviteEmail(input: InviteEmailInput): RenderedEmail {
  const workspace = singleLine(input.workspaceName) || 'a workspace';
  const inviter = input.inviterName ? singleLine(input.inviterName) : '';
  const role = ROLE_LABELS[input.role].toLowerCase();
  const who = inviter || 'Someone';
  const subject = `${who} invited you to ${workspace} on Formyx`;
  const article = /^[aeiou]/.test(role) ? 'an' : 'a';
  const summary = `Join as ${article} ${role} to ${ROLE_ABILITIES[input.role]}.`;
  const expiry = `The link works for ${INVITE_TTL_DAYS} days, for this email address only.`;

  const text = [
    subject,
    '',
    summary,
    '',
    `Accept the invite: ${input.acceptUrl}`,
    '',
    expiry,
    "If you weren't expecting this, you can ignore it.",
  ].join('\n');

  const html = emailPage({
    appUrl: input.appUrl,
    subject,
    preheader: summary,
    card: `${p(`font-size:13px;line-height:20px;color:${COLOR.muted};`, `${escapeHtml(who)} invited you to`)}
        ${heading(workspace)}
        ${p(`font-size:14px;line-height:21px;color:${COLOR.text};margin-top:8px;`, escapeHtml(summary))}
        ${button('Accept invite', input.acceptUrl)}
        ${p(`font-size:13px;line-height:20px;color:${COLOR.muted};margin-top:16px;`, escapeHtml(expiry))}`,
    footer: "If you weren't expecting this invite, you can ignore it.",
  });

  return { subject, html, text };
}
