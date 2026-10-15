import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Mailer } from '../lib/mailer.js';
import {
  button,
  COLOR,
  emailPage,
  escapeHtml,
  heading,
  paragraph as p,
  singleLine,
  type RenderedEmail,
} from '../notifications/email-layout.js';

/*
 * Confirming an account's email address: a signed link, valid for a few days. Only asked for
 * while REQUIRE_EMAIL_VERIFICATION is on, and then publishing waits for it. Google and Zoho
 * accounts are confirmed by the provider and never get the email.
 */

const ISSUER = 'formyx';
const AUDIENCE = 'formyx-verify-email';
const LINK_DAYS = 3;

const payloadSchema = z.object({ sub: z.string().min(1), email: z.string().min(1) });

/** A token for the link that confirms `email` for `userId`. */
export function makeVerificationToken(userId: string, email: string, secret: string): string {
  return jwt.sign({ email }, secret, {
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: userId,
    expiresIn: LINK_DAYS * 24 * 60 * 60,
  });
}

/** Who a link's token confirms, or null for one that is not ours, or expired. */
export function readVerificationToken(
  token: string,
  secret: string,
): { userId: string; email: string } | null {
  try {
    const payload = payloadSchema.parse(
      jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE }),
    );
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export function renderVerifyEmail({
  appUrl,
  name,
  link,
}: {
  appUrl: string;
  name: string;
  link: string;
}): RenderedEmail {
  const subject = 'Confirm your email for Formyx';
  const first = singleLine(name).split(' ')[0] ?? '';
  const title = first ? `Confirm your email, ${first}` : 'Confirm your email';
  const line = `Confirm this address to publish forms on Formyx. The link works for ${String(LINK_DAYS)} days.`;
  const ignore = 'If you didn’t sign up for Formyx, ignore this email.';
  return {
    subject,
    text: [title, '', line, '', `Confirm your email: ${link}`, '', ignore].join('\n'),
    html: emailPage({
      appUrl,
      subject,
      preheader: 'One click and you can publish.',
      card: `${heading(title)}
        ${p(`font-size:14px;line-height:21px;color:${COLOR.text};margin-top:12px;`, escapeHtml(line))}
        ${button('Confirm your email', link)}`,
      footer: escapeHtml(ignore),
    }),
  };
}

/** Emails `user` the link that confirms their address. */
export async function sendVerificationEmail(
  { mailer, appUrl, secret }: { mailer: Mailer; appUrl: string; secret: string },
  user: { id: string; name: string; email: string },
): Promise<void> {
  const token = makeVerificationToken(user.id, user.email, secret);
  const link = `${appUrl}/verify-email?token=${encodeURIComponent(token)}`;
  await mailer.send([{ to: user.email, ...renderVerifyEmail({ appUrl, name: user.name, link }) }], {
    // One email per account a minute at most, however often the button is pressed.
    idempotencyKey: `verify-email:${user.id}:${String(Math.floor(Date.now() / 60_000))}`,
  });
}
