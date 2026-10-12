import { FEEDBACK_KIND_LABELS, type FeedbackKind } from '@formyx/shared';
import {
  COLOR,
  emailPage,
  escapeHtml,
  heading,
  paragraph as p,
  singleLine,
  type RenderedEmail,
} from './email-layout.js';

export interface FeedbackEmailInput {
  kind: FeedbackKind;
  message: string;
  page?: string | undefined;
  /** Who sent it, so the team can reply. */
  senderName: string;
  senderEmail: string;
}

/** Feedback from the app, for the team's inbox: replying answers the person who sent it. */
export function renderFeedbackEmail(input: FeedbackEmailInput): RenderedEmail {
  const sender = singleLine(input.senderName) || input.senderEmail;
  const kind = FEEDBACK_KIND_LABELS[input.kind];
  const subject = `Feedback: ${kind.toLowerCase()} from ${sender}`;
  const where = input.page ? `Sent from ${input.page}` : 'Sent from the app';

  const text = [subject, '', input.message, '', `${where}. Reply to answer ${sender}.`].join('\n');
  const html = emailPage({
    subject,
    preheader: singleLine(input.message).slice(0, 90),
    card: `${p(`font-size:13px;line-height:20px;color:${COLOR.muted};`, escapeHtml(`${kind} from ${sender} (${input.senderEmail})`))}
        ${heading('Feedback')}
        ${p(`font-size:14px;line-height:21px;color:${COLOR.text};margin-top:8px;white-space:pre-wrap;`, escapeHtml(input.message))}
        ${p(`font-size:13px;line-height:20px;color:${COLOR.muted};margin-top:16px;`, escapeHtml(`${where}.`))}`,
    footer: `Reply to this email to answer ${sender}.`,
  });

  return { subject, html, text };
}
